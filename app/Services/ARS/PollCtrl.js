/** @module PollController */
var async = require('async');
var Scheduler = require('../Timing/Scheduler.js');
var Timer = new Scheduler({ autoFin : false, registerLoopElements : 10 });
var Rooms = require('../../../models/Room.js');
var QuestionModel = require('../../../models/ARSModels/Question.js').ARSQuestion;
var ARSAnswer = require('../../../models/ARSModels/Answer.js').ARSAnswer;
var PollModel = require('../../../models/ARSModels/Poll.js').ARSPoll;
var StatisticModel = require('../../../models/ARSModels/Statistic.js').ARSStatistic;
var StatisticObjModel = require('../../../models/ARSModels/StatisticObj.js').StatisticObj;
var logger = require('../../Logger.js');

/**
 * gets all polls in one room.
 * This is probably bad style as this is directly exposed by mongoose. The alternative would be fiddling
 * with the database layer in the api or to be more specific in the view. This is mostly not wanted.
 *
 * @param{String} roomId This is a stringified mongoose ObjectId of a room.
 * @params{Function} cb Function with error and data parameter.
 * @params{String} dpOptions More options to deepPopulation. By default the rooms polls and the polls answers are populated
 */
var getAllPollsInRoom = function (roomId, dpOptions, cb) {
    Rooms.Room.findOne({ _id : roomId}).lean().populate({path : 'poll'}).exec(function (err, room) {
        if (err) {
            logger.warn(err);
            return cb(err);
        }
        cb(null, room.poll);
    }); 
};

var getStatistics = function (pollId, cb) {
    QuestionModel.findOne({ _id : pollId}).deepPopulate('poll.statistics.statisticAnswer.answer').exec(function (err, ars) {
        if (err) {
            return cb(err);
        } else if (ars && ars.poll && ars.poll.statistics) {
            cb(null, ars);
        } else {
            cb(new Error("Not Found."));
        }
    });
};
/**
 * The Function title is misleading. It gets a poll by id but decides if a user already answered the question.
 * @param  {String} userId the users userId.
 * @param {String} arsId the requested arsId
 * @param  {Function} callback. errors and data ca be set
 * @param  {String} optional population
 */
var getPoll = function (userId, arsId, cb) {
    logger.debug(arsId);
    QuestionModel.findOne({ _id : arsId }).exec(function (err, question) {
        if (err || !question) {
            logger.warn(err);
            return cb(err);
        }
        
        var call = function (err, q) {
            if (err) {
                logger.warn(err);
                return cb(err);
            }
            logger.debug("" + q);
            cb(null, q);
        };
        logger.debug("" + question);
        for (var i = 0; i < question.answered.length; i++) {
            if (question.answered[ i ].toString() === userId || !question.active) {
                return QuestionModel.findOne({_id : arsId }).deepPopulate('poll poll.answers poll.statistics.statisticAnswer.answer')
                    .exec(call); //do it this way as deepPopulation is easier than populating the document itself.      
            }
        }
        return QuestionModel.findOne({_id : arsId }).deepPopulate('poll poll.answers')
            .exec(call);
    }); 
};

/**
 *
 * @param roomId
 * @param userId
 * @param cb err set on error or if there is a poll, poll is set. if not, null.
 */
var getNext = function (roomId, userId, cb) {
    Rooms.Room.findOne({ _id: roomId}).lean().populate({path : 'poll'}).exec(function (err, room) {
        var options = {
            path: 'poll.poll',
            model: 'ARSPoll'
        };
        Rooms.Room.populate(room, options, function (err, r) {
            options.path = 'poll.poll.answers';
            options.model = 'ARSAnswer';
            Rooms.Room.populate(r, options, function (err, rr) {
                logger.debug("populated room: " + JSON.stringify(rr));

                if (err) {
                    logger.warn(err);
                    return cb(err);
                }
                var noAnswer = true;
                if (rr.poll) {
                    for (var i = 0; i < rr.poll.length; i++) {
                        noAnswer = true;
                        for (var j = 0; j < rr.poll[ i ].answered.length; j++) {
                            var uid = rr.poll[ i ].answered[ j ].toString();
                            if (uid === userId) {
                                noAnswer = false;
                            }
                        }
                        if (noAnswer) {
                            if (rr.poll[ i ] && rr.poll[ i ].active) {
                                return cb(err, rr.poll[ i ]);
                            }
                        }
                    }
                }
                return cb(null, null);
            });
        });
    });
};

/** Create a new Poll including timeout.
 * @param {Object} params - answers, dueDate, 
 * @param {Object} options - options to this method. Will be expanded.
 * @param {Function} cb - Callback for errors and full question on success
 * @param {Function} tcb - Callback for timer timeout.
 */
var newPoll = function (params, cb, tcb) {
	var dueDate;
    if (typeof params.dueDate === 'number') {
    	dueDate = params.dueDate;
    } else {
        return cb(new Error("dueDate is invalid"));
    }

    if (dueDate < 0) {
    	return cb(new Error("dueDate is in the past"));
    }

    var _question = new QuestionModel();
	_question.description = params.description;
    _question.dueDate = dueDate* 1000 + Date.now();
    _question.active = false;
	var _poll = new PollModel();
    var _statistic = new StatisticModel();
    _statistic.save();
    _poll.statistics = _statistic._id;

	var _tId = Timer.addTimeout(function () {
		QuestionModel.findOne({_id : _question._id}).exec(function (err, q) {
            if (err) {
                logger.warn(err);
                return tcb(err);
            }
            q.active = false;
            q.save();
            tcb(q);
        });
	}, 500 * 60 * 1000 + 1000);
	
	var _tempAnswers = []; // having something like a transaction to prevent saving invalid data
	var i;
	for (i = params.answers.length - 1; i >= 0; i--) {
		var _answer = new ARSAnswer();
		_answer.description = params.answers[ i ].description;
		if (params.answers[ i ].radiobox && (params.answers[ i ].checkbox || params.answers[ i ].text) || // Prevent multiple fieldsettings
            params.answers[ i ].text && (params.answers[ i ].checkbox || params.answers[ i ].radiobox) ||
            params.answers[ i ].checkbox && (params.answers[ i ].text || params.answers[ i ].radiobox)) {
			Timer.clearTimer(_tId);
			return cb(new Error("Bad field settings."));
		}
		_answer.radiobox = params.answers[ i ].radiobox;
		_answer.checkbox = params.answers[ i ].checkbox;
		_answer.text = params.answers[ i ].text;
		_poll.answers.push(_answer._id); //reference the new answer
		_tempAnswers.push(_answer);
	}

	var saveAns = function (ans) {
		ans.save(function (err) {
			if (err) {
				Timer.clearTimer(_tId);
				cb(err);
			}
		});
	};

	for (i = _tempAnswers.length - 1; i >= 0; i--) {
		saveAns(_tempAnswers[ i ]);
	}

	_poll.save(function (err) {
		if (err) {
			Timer.clearTimer(_tId);
			cb(err);
		}

        _question.poll = _poll._id;
        _question.save(function (err) {
            if (err) {
                logger.warn(err);
                Timer.clearTimer(_tId);
                return cb(err);
            }

            QuestionModel.findOne({ _id : _question._id}).deepPopulate('poll.answers').exec(function (err, question) {
                if (err) {
                    logger.warn("An error occured when populating new Quiz " + err);
                    Timer.clearTimer(_tId);
                    cb(err);
                } else {
                    Rooms.getByID(params.roomId, {population : ''}, function (err, room) {
                        room.hasPoll = true;
                        room.poll.push(question._id);
                        room.save(function (err) {
                            if (err) {
                                logger.warn("An error occurred on room update when creating a new quiz: " + err);
                                return cb(err);
                            }
                            cb(null, question); // pass back the just created question with fully populated data.
                        });
                    });
                }
            });
        });
    });
};

/**
 * This function processes a new answer, made by a user and aggregates the statistics.
 * 
 * @param  {Object} params.userId, params.answerId, params.arsId, params.roomId need to be set. This is checked before by the framework
 * @param  {Function} callback function. error and data can be set
 */
var answer = function (params, cb) { // refactor this. it is perhaps much too complicated
    // params.userId, params.answerId, params.arsId, params.roomId
    QuestionModel.findOne({ _id : params.arsId }).deepPopulate('poll poll poll.statistics poll.statistics.statisticAnswer.answer').exec(function (err, q) {
        if (err) {
            logger.debug(err);
            return cb(err);
        }
        for (var l = 0; l < q.answered.length; ++l) {
            if (params.userId === q.answered[ l ].toString()) {
                return cb(new Error("You already answered this one."));
            }
        }
        q.answered.push(params.userId);
        q.save();
        if (q.active) {
            // we can answer this one
            var _statObj,
                existing = false,
                answered = false;
            for (var j = 0; j < params.answerId.length; ++j) {
                for (var k = 0; k < q.poll.answers.length; ++k) {
                    logger.debug(q.poll.answers[ k ].toString());
                    if (params.answerId[ j ] === q.poll.answers[ k ].toString()) {
                        for (var i = 0; i < q.poll.statistics.statisticAnswer.length; ++i) {
                            if (q.poll.statistics.statisticAnswer[ i ].answer && params.answerId[ j ] === q.poll.statistics.statisticAnswer[ i ].answer._id.toString()) {
                                // there is already an object for this answer
                                answered = true;
                                StatisticObjModel.findOne({ _id : q.poll.statistics.statisticAnswer[ i ]._id.toString() }).exec(function (err, obj) {
                                    if (!err && obj) {
                                        obj.count++;
                                        obj.save();
                                    }
                                });
                                break;
                            }
                        }
                        if (!answered) {
                            _statObj = new StatisticObjModel();
                            _statObj.count = 1;
                            _statObj.answer = params.answerId[ j ];
                            _statObj.save();
                            q.poll.statistics.statisticAnswer.push(_statObj._id);
                            q.poll.statistics.save();
                        } else {
                            answered = false;
                        }
                        existing = true;
                        break;
                    }
                }
            }
            if (!existing) {
                return cb(new Error("This answer does not exist."));
            } else {
                q.poll.save();
                process.nextTick(function () {
                    cb(null, q); // TODO make sure that statistics field is populated
                });
            }
        } else {
            if (q.active) { // the server died during the poll, we need a cleanup TODO: check time overaprrox of the previous reset.
                q.active = false;
                Rooms.findByID({ _id: params.roomId}, function (err, room) {
                    if (err) {
                        logger.warn(err);
                        return cb(err);
                    }
                    delete room.poll[ q._id ];
                    if (room.hasPoll && room.poll.length === 0) {
                        room.hasPoll = false;
                    }
                    q.active = false;
                    q.save();
                    room.save();
                    logger.info("cleaned up question activity flag and reset room.");
                });
            }
            return cb(new Error("Time is up."));
        }
    });
};

var deletePoll = function (roomId, pollId, callback) {
    var asyncTasks = [];

    QuestionModel.findOne({ _id : pollId}).deepPopulate('poll.statistics').exec(function (err, question) {
        if (!question) {
            return callback(null, true);
        }
        asyncTasks.push(function (pollCallback) {
            var answerAsyncTasks = [];
            question.poll.answers.forEach(function (answer) {
                answerAsyncTasks.push(function (answerCallback) {
                    ARSAnswer.find({ _id: answer}).remove( answerCallback );
                });
            });
            question.poll.statistics.statisticAnswer.forEach(function (statObj) {
                answerAsyncTasks.push(function (statCallback) {
                    StatisticObjModel.find({ _id: statObj}).remove( statCallback );
                });
            });
            answerAsyncTasks.push(function (statCallback) {
                StatisticModel.find({ _id: question.poll.statistics._id }).remove( statCallback );
            });

            async.parallel(answerAsyncTasks, function (answerAsyncErr) {
                pollCallback(answerAsyncErr);
            });
        });

        /*
         TODO sorry, but this is simply not necessary. Mongoose already uses async IO. Doing This async results in
         putting this in the process.nextTick queue. Mongoose does this again. But I think, this won't break things.
         Maybe when there is some bad luck: asyncTasks array is empty as MongoDB is really busy.
         */
        async.parallel(asyncTasks, function (asyncErr) {
            question.remove(function () {
                Rooms.Room.update({ _id: roomId }, { $pull: { 'poll': pollId } }).exec(function (err) {
                    if (err) {
                        logger.warn(err);
                        return callback(err);
                    }
                    var error = (asyncErr) ? asyncErr : err;
                    callback(error, (error) ? false : true);
                });
            });
        });
        
    });
};

var togglePollActivation = function (roomId, pollId, bool, cb) {
    QuestionModel.findOne({ _id : pollId}).deepPopulate('poll.statistics.statisticAnswer.answer').exec(function (err, ars) {
        if (err) {
            return cb(err);
        } else {
            ars.active = bool;
            ars.save(function (err, arsObj) {
                cb(err, arsObj);
            });
        }
    });
};


module.exports.answer = answer;
module.exports.newPoll = newPoll;
module.exports.getPoll = getPoll;
module.exports.getNext = getNext;
module.exports.getAllPollsInRoom = getAllPollsInRoom;
module.exports.deletePoll = deletePoll;
module.exports.getStatistics = getStatistics;
module.exports.togglePollActivation = togglePollActivation;
