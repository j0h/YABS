/** @module Misc/ProfilePicture */

/* global __dirname */

var config = require('../config.json');
var logger = require('./Logger.js');
var imageDAO = require('../models/Image.js');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path').join(__dirname, '/../images/avatar');

/** Requires imagemagick */
var gen = require('avatar-generator')({});

/**Generate an avatar for an user profile.
 * @param {User} user - target user object
 * @param {String} gender - gender of avatar
 * @param {Number} resolution - width and height, because of a square profile avatar
 * @param {imageCallback} callback - callback function
 */
module.exports.generate = function (user, gender, resolution, callback) {
	var hash = crypto.createHash('sha256').update(user._id.toString()).digest('hex');
	logger.debug("profile image hash: " + hash);
	fs.mkdir(path, function (err) {
		var writestream = fs.createWriteStream(path + '/' + hash + '.png');
		var imgstream = gen(user._id | (new Date()).valueOf().toString(), gender, resolution).stream();
		imgstream.pipe(writestream);
		imgstream.on('end', function () {
			var stats = fs.statSync(path + '/' + hash + '.png');
			var avatar = new imageDAO.Image();
			avatar.owner = user._id;
			avatar.path = '/images/avatar/' + hash + '.png';
			avatar.resolution.width = resolution;
			avatar.resolution.height = resolution;
			avatar.size = stats.size;
			avatar.type = 'png';

			avatar.save(function (err) {
				if (err) {
					return callback(new Error("Could not save avatar."), null);
				} else {
					return callback(null, avatar);
				}
			});
		});
	});
};

/**
 * @callback errorCallback
 * @param {Error} err - if an error occurs
 */
