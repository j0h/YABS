/**
 * @file
 * @author Jens Piekenbrinck [jens.piekenbrinck@rwth-aachen.de]
 * @module Models/ARSQuizUserAnswer
 */

var mongoose = require('mongoose');
var deepPopulate = require('mongoose-deep-populate');
var ObjectId = mongoose.Schema.ObjectId;

var ARSQuizUserAnswerSchema = mongoose.Schema({
	user: {type: ObjectId, ref: 'User'},
    answers: [{ type : ObjectId, ref: 'ARSAnswer'}]
});

ARSQuizUserAnswerSchema.plugin(deepPopulate);
var ARSQuizUserAnswer = mongoose.model('ARSQuizUserAnswer', ARSQuizUserAnswerSchema);
module.exports.ARSQuizUserAnswer = ARSQuizUserAnswer;
