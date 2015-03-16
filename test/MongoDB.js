var Room = require('../models/Room.js');
var Question = require('../models/Question.js');
var User = require('../models/User.js');
var Answer = require('../models/Answer.js');
var mongoose = require('mongoose');
var async = require('async');

mongoose.connect('mongodb://localhost/test');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open',function(callback){
	//MainController(db);

	mongoose.connection.db.dropDatabase(function(error) {
	    console.log('db dropped');
	    var u = new User.User({name: "Jens"});
		var r = new Room.Room({l2pID: "L2P", name: "DSAL"});
		var r2 = new Room.Room({l2pID: "L2P", name: "DSAL"});
		var a = new Answer.Answer({author: u._id, content: "Answering"});
		var q = new Question.Question({author: u._id, content: "Johannes"});

		/*User.createUser(u, function(){
			User.getUser(u._id, function(err, res){
				Room.createRoom(r, function(err, res){
					Question.addQuestion(r._id, q, function(err){
						Question.vote(q._id, u._id, function(err){
							Question.getVotes(q._id, {population:'votes'}, function(err, res){
								Question.getVotesCount(q._id, function(err, res){
									console.log(JSON.stringify(res,null,2));
								});
							});
						});
					});
				});
			});
		});*/

		async.waterfall([
			function(callback){
				User.createUser(u, function(err){callback(err, u._id);});
			},
			function(userID, callback){
				User.getUser(userID, function(err, u){callback(err, u);});
			},
			function(user, callback){
				User.addRoomToUser(user, r, function(err, user){callback(err,user)});
			}
		], function(err, res){
			if(err)
				throw err;
			console.log(JSON.stringify(res,null,2));
		});


		/*MainController.createUser(u, function(){
			MainController.createRoom(r, function(e, room){
				MainController.addQuestion(room._id, q, function(e,quest){
					MainController.setQuestionContent(quest._id, "Daniel2", function(e){
						MainController.addAnswer(quest._id, a, function(e, ans){
							MainController.setAnswerContent(ans._id, "Testing Answer", function(e){
								MainController.getRooms({population:'questions.answers'}, function(err,res){
									console.log(JSON.stringify(res,null,2));
								});
							});
						});
					});
				});
			});
		});*/
		
	});
});