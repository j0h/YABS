var system = require('./System.js');
var questionDAO = require('../../models/Question.js');
var userDAO = require('../../models/User.js');
var roomDAO = require('../../models/Room.js');
var panicDAO = require('../Panic.js');
var answerDAO = require('../../models/Answer.js');
var logger = require('../Logger.js');
var roomWSControl = require('./Room.js');
var roles = require('../../config/UserRoles.json');
var session = require('express-session');
var sessionStore = require('connect-redis')(session);
var sessionStore = new sessionStore();
var imageDAO = require('../../models/Image.js');

module.exports = function (wsControl) {
	wsControl.on("user:vote", function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			if (params.questionId) {
				userDAO.hasAccessToQuestion(session.user, { _id : params.roomId }, { _id : params.questionId }, { population: 'author images author.avatar answers.images answers answers.author answers.author.avatar' }, function (err, user, question) {
					if (err) {
						return logger.warn("could not check user access: " + err);
					}
					if (roomWSControl.createVotesFields(session.user, question).hasVote) {
						return wsControl.build(ws, new Error("You already voted for this Question!"), null, refId);
					}
					questionDAO.vote(question, session.user, function (err, quest) {
						if (err) {
							logger.warn('Could not vote: ' + err);
							return wsControl.build(ws, new Error('Could not vote.'), null, refId);
						} else if (quest) {
							question = JSON.parse(JSON.stringify(question));
							question.author = roomWSControl.removeAuthorFields(question.author);
							question.author.avatar = question.author.avatar.path;
							question.votes = quest.votes;
							question.images = roomWSControl.removeOwnerFields(question.images);
							for (var i = question.answers.length - 1; i >= 0; i--) {
								question.answers[ i ].images = roomWSControl.removeOwnerFields(question.answers[ i ].images);
								question.answers[ i ].author.avatar = question.answers[ i ].author.avatar.path;
							}
							question.answers = roomWSControl.removeAuthorTokens(question.answers);

							wss.roomBroadcast(ws, 'question:add', {
								'roomId': params.roomId,
								'question': question
							}, params.roomId);
						} else {
							wsControl.build(ws, new Error('Could not vote.'), null, refId);
						}
					});
				});
			} else {
				wsControl.build(ws, new Error("Malformed Parameters."), null, refId);
			}
		} else {
			wsControl.build(ws, new Error("Permission denied."), null, refId);
		}
	});

	wsControl.on('user:fetchRooms', function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			var worker = system.getWorkerMap()[ sId ];
			if (worker) {
				worker.fetchRooms(refId);
			} else {
				wsControl.build(ws, new Error("Your worker is invalid."), null, refId);
			}
		} else {
			wsControl.build(ws, new Error("Your session is invalid."), null, refId);
		}
	});
    
	wsControl.on('user:getRooms', function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			userDAO.getRoomAccess(session.user, {population: ''}, function (err, rooms) {
				if (err) {
					return logger.warn("could not get rooms: " + err);
				}
				rooms = rooms.toObject();
				var _roomSend = function (room) {
					panicDAO.hasUserPanic(session.user, room, function (err, panicEvent) {
						panicDAO.isRoomRegistered(room, function (isRegistered) {
							room.hasUserPanic = (!err && panicEvent) ? true : false;
							room.isRoomRegistered = isRegistered;
							wsControl.build(ws, null, null, null, "room:add", {
								'room': room
							});
						});
					});
				};
				for (var i = rooms.length - 1; i >= 0; i--) {
					var r = rooms[ i ].toObject();
					(_roomSend)(r);
				}                    
			});
		} else {
			wsControl.build(ws, new Error("Your session is invalid."), null, refId);
		}
	});

	wsControl.on('user:ask', function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			if (params && params.question && params.roomId) {

				if (params.question === "" || typeof params.question !== 'string') {
					return wsControl.build(ws, new Error("invalid question format"), null, refId);
				}
				userDAO.getRoomAccess(session.user, {population: ''}, function (err, access) {
					if (err) {
						logger.warn("error on getting room access array " + err);
					} else {
						var _answerSaveSend = function (err, images) {
							//images = images.toObject();
							aCopy = JSON.parse(JSON.stringify(q)); // to send
							q.images = params.images;// to save
							aCopy.images = images;
							for (var key in aCopy.images) {
								aCopy.images[ key ].owner = undefined; // delete own user id
							}
							sendAndSaveQuestion(wsControl, wss, ws, params.roomId, q, aCopy, refId);
						};
						for (var i = access.length - 1; i >= 0; i--) {
							if (access[ i ]._id == params.roomId) {
								var q = new questionDAO.Question();
								q.author = session.user._id;
								q.content = params.question;
								q.votes = session.user._id;
								q.answers = [];
                                    
								if (params.images && params.images !== [] && Object.prototype.toString.call(params.images) === '[object Array]') {
									//check if valid image ids
									imageDAO.Image.find({_id: { $in : params.images }}, _answerSaveSend);
								} else {
									sendAndSaveQuestion(wsControl, wss, ws, params.roomId, q, q, refId);
								}      
								return;
							}
						}
						wsControl.build(ws, new Error("Access Denied."), null, refId);
					}
				});
			} else {
				wsControl.build(ws, new Error("Malformed Parameters."), null, refId);
			}
		} else {
			wsControl.build(ws, new Error("Permission denied."), null, refId);
		}
	});

	wsControl.on("user:answer", function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			if (params && params.roomId && params.questionId && params.answer) {
				if (params.answer === "" || typeof params.answer !== 'string') {
					return wsControl.build(ws, new Error("invalid question format"), null, refId);
				}
				userDAO.getRoomAccess(session.user, {population: 'questions'}, function (err, access) {
					var hasAccess = false;
					var _answerSend = function (err, q) {
						if (q) {
							var a = new answerDAO.Answer();
							a.author = session.user._id;
							a.content = params.answer;
							if (params.images && params.images !== [] && Object.prototype.toString.call(params.images) === '[object Array]') {
								//check if valid image ids
								imageDAO.Image.find({_id: { $in : params.images }}, function (err, images) {
									//images = images.toObject();
									aCopy = JSON.parse(JSON.stringify(a)); // to send
									a.images = params.images;// to save
									aCopy.images = images;
									for (var key in aCopy.images) {
										aCopy.images[ key ].owner = undefined; // delete own user id
									}
									sendAndSaveAnswer(wsControl, wss, ws, q, a, room, aCopy, refId);
								});
                                
							} else {
								sendAndSaveAnswer(wsControl, wss, ws, q, a, room, a, refId);
							}
							return;
						}
					};
					for (var i = access.length - 1; i >= 0; i--) {
						if (access[ i ]._id == params.roomId) {
							hasAccess = true;
							var room = access[ i ];
                            
							questionDAO.getByID(params.questionId, {population : ''}, _answerSend);
						}
					}
					if (!hasAccess) {
						wsControl.build(ws, new Error("Access Denied."), null, refId);
					}
				});
			} else {
				wsControl.build(ws, new Error("malformed params"), null, refId);
			}
		} else {
			wsControl.build(ws, new Error("Permission denied."), null, refId);
		}
	});

	wsControl.on('user:getAccessLevel', function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			sessionStore.get(sId, function (err, sess) {
				if (sess.user && sess.user.rights) {
					for (var key in sess.user.rights) {
						if (sess.user.rights[ key ].roomId === params.roomId) {
							return wsControl.build(ws, null, { accessLevel: sess.user.rights[ key ].accessLevel}, refId);
						}
					}
				}
				wsControl.build(ws, null, { accessLevel: roles.defaultLoggedIn}, refId);
			});
		} else {
			wsControl.build(ws, null, { accessLevel: roles.default}, refId);
		}
	});

	wsControl.on('user:panic', function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			if (params && params.roomId) {
				userDAO.hasAccessToRoom(session.user, {_id: params.roomId}, {population: ''}, function (err, user, room) {
					if (err) {
						wsControl.build(ws, new Error("Access denied."), null, refId);
						return logger.warn("could not check room access: " + err);
					}
					panicDAO.panic(session.user, {_id: params.roomId}, function (err) {
						if (err) {
							return wsControl.build(ws, new Error("Cannot save user's panic. "+ err), null, refId);
						}
						wsControl.build(ws, null, {'status': true}, refId);
					});                
				});
			} else {
				wsControl.build(ws, new Error("Your session is invalid."), null, refId);
			}
		} else {
			wsControl.build(ws, new Error("Your session is invalid."), null, refId);
		}
	});

	wsControl.on('user:unpanic', function (wss, ws, session, params, interfaceEntry, refId, sId, authed) {
		if (authed) {
			if (params && params.roomId) {
				userDAO.hasAccessToRoom(session.user, {_id: params.roomId}, {population: ''}, function (err, user, room) {
					if (err) {
						wsControl.build(ws, new Error("Access denied."), null, refId);
						return logger.warn("could not check room access: " + err);
					}
					panicDAO.unpanic(session.user, {_id: params.roomId}, function (err) {
						if (err) {
							return wsControl.build(ws, new Error("Cannot delete user's panic."), null, refId);
						}
						wsControl.build(ws, null, {'status': true}, refId);
					});                
				});
			} else {
				wsControl.build(ws, new Error("Your session is invalid."), null, refId);
			}
		} else {
			wsControl.build(ws, new Error("Your session is invalid."), null, refId);
		}
	});
};

/**
 * Helper Function to broadcast questions.
 * @param  {[type]} wss     [description]
 * @param  {[type]} ws      [description]
 * @param  {[type]} roomId  [description]
 * @param  {[type]} q       [description]
 * @param  {[type]} qToSend [description]
 * @return {[type]}         [description]
 */
function sendAndSaveQuestion(wsControl, wss, ws, roomId, q, qToSend, refId) {

	roomDAO.addQuestion({ _id : roomId}, q, function (err, room, question) {
		if (err) {
			logger.warn("could not add or create question: " + err);
			wsControl.build(ws, new Error("could not add or create question"), null, refId);
		} else {
			questionDAO.getByID(question._id, {population : 'author author.avatar images'}, function (err, quest) {
				qToSend = JSON.parse(JSON.stringify(quest));
				qToSend.author = roomWSControl.removeAuthorFields(qToSend.author);
				qToSend.author.avatar = qToSend.author.avatar.path;
				qToSend.answers = roomWSControl.removeAuthorTokens(quest.answers);
				wss.roomBroadcast(ws, 'question:add', {
					'roomId': room._id,
					'question': qToSend
				}, room._id);
				logger.info("added new question to room " + room._id);
			});
		}
	});
}


/**
 * Helper Function to broadcast answers.
 * @param  {[type]} wss          [description]
 * @param  {[type]} ws           [description]
 * @param  {[type]} q            [description]
 * @param  {[type]} a            [description]
 * @param  {[type]} answerToSend [description]
 * @return {[type]}              [description]
 */
function sendAndSaveAnswer(wsControl, wss, ws, q, a, room, answerToSend, refId) {
	questionDAO.addAnswer(q, a, function (err, question, answer) {
		if (err) {
			logger.warn("could not add or create question: " + err);
			wsControl.build(ws, new Error("could not add or create answer"), null, refId);
		} else {
			answerDAO.getByID(answer._id, {population: 'author author.avatar images'}, function (err, ans) {
				//ans.toObject();
				answerToSend = JSON.parse(JSON.stringify(ans));
				answerToSend.author = roomWSControl.removeAuthorFields(answerToSend.author);
				answerToSend.images = roomWSControl.removeOwnerFields(answerToSend.images);
				answerToSend.author.avatar = ans.author.avatar.path;
				wss.roomBroadcast(ws, 'answer:add', {
					'roomId': room._id,
					'questionId': question._id,
					'answer': answerToSend
				}, room._id);
				logger.info("added new answer to room " + room.l2pID);
			});
		}
	});
}
