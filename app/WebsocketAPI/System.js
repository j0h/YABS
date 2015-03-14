var logger = require('../Logger.js');
var config = require('../../config.json');
var querystring = require('querystring');
var User = require('../../models/User.js').User;
var session = require('express-session');
var sessionStore = require('connect-redis')(session);
sessionStore = new sessionStore();
var userWorker = require('../UserWorker.js');
var campus = require('../RWTH/CampusRequest.js');
workerMap = {};

module.exports = function(wsControl){
    wsControl.on('system:close', function(ws, sId){
        workerMap[sId].stop();
        process.nextTick(function(){
            delete workerMap[sId];
        });
    });
    wsControl.on('system:open', function(ws, session){
        wsControl.build(ws, null, {message: 'welcome'}, null);
    });
    wsControl.on('system:ping', function(wss, ws, session, params, interfaceEntry, refId){
        wsControl.build(ws, null, "pong", refId);
    });
    
    wsControl.on('system:login', function(wss, ws, session, params, interfaceEntry, refId, sId){
        postReqCampus('code' ,querystring.stringify({
            "client_id": config.login.l2p.clientID,
            "scope": config.login.l2p.scope
        }), function(err, answer){
            if (err){
                wsControl.build(ws, err, null, refId);
                logger.warn(err);
                return;
            } else if(answer){
                try{
                    answer = JSON.parse(answer);
                } catch(e) {
                    wsControl.build(ws, new Error("An error occured when communicating with Campus. lol."), null, refId);
                    logger.warn('An error occured whon communicating with Campus OAuth. Response was: ' + answer);
                    return;
                }
                var _url = answer.verification_url + '?q=verify&d=' + answer.user_code;
                logger.debug(_url);
                wsControl.build(ws, null, {
                    message: "Please visit the provided url.",
                    url: _url
                }, refId);
                var auth = false;
                var reqTime = 0;
                var timer = setInterval(function(){
                    if(!auth && reqTime < answer.expires_in){
                        // poll
                        postReqCampus('token', querystring.stringify({
                            "client_id": config.login.l2p.clientID,
                            "code": answer.device_code,
                            "grant_type": "device"
                        }), function(err, response){
                            if (err){
                                wsControl.build(ws, err, null, refId);
                                logger.warn(err);
                                return;
                            } else if (response){
                                logger.debug(response);
                                try{
                                    response = JSON.parse(response);
                                } catch(e) {
                                    logger.error();
                                    wsControl.build(ws, new Error("An error occured when communicating with Campus. lol."), null, refId);
                                    logger.warn('An error occured when communicating with Campus OAuth. Response was: ' + response);
                                }
                                if(response.status){
                                    if(response.status === "ok"){
                                        // it's an access token. wuhsa!
                                        logger.debug(response);
                                        auth = true;
                                        clearInterval(timer);
                                        var _user = new User();
                                        _user.rwth.token = response.access_token;
                                        _user.rwth.refresh_token = response.refresh_token;
                                        _user.rwth.expires_in = response.expires_in;
                                        _user.save(function(err){
                                            if(err) {
                                                wsControl.build(ws, err, null, refId);
                                                logger.warn(err);
                                                return;
                                            }
                                            session.user = _user;
                                            sessionStore.set(sId, session, function(err){
                                                if(err) {
                                                    wsControl.build(ws, err);
                                                    return;
                                                }
                                                wsControl.build(ws, null, { "status": "succes" }, refId);
                                                // start a worker that fetches rooms.
                                                var worker = new userWorker(sId, ws, _user);
                                                if(!workerMap[sId]){
                                                    workerMap[sId] = worker;
                                                } else {
                                                    worker = workerMap[sId];
                                                    worker.ws = ws; // this is necessary!
                                                    worker.user = _user; // this not.
                                                }
                                                process.nextTick(function(){
                                                    logger.info("starting new user worker.");
                                                    worker.fetchRooms(); //start worker after this request.
                                                });
                                                logger.info("created new user.");
                                            });
                                        });
                                        
                                    } else if(response.status === "error: authorization pending."){
                                        wsControl.build(ws, new Error("still waiting"), null, refId);
                                    }

                                } else {
                                    wsControl.build(ws, new Error("There was no status in Campus answer."), null, refId);
                                }
                            }
                        });
                    }else if(reqTime >= answer.expires_in){
                        wsControl.build(ws, new Error("Your authentication request failed. Please try again."), null, refId);
                    }else{ // authenticated
                        clearInterval(timer);
                    }
                    reqTime += answer.interval;
                }, (answer.interval > 1200 ? answer.interval * 200 : answer.interval));
                // Campus currently responds with 30 minutes polltime. srsly?
            } else {
                wsControl.build(ws, new Error("Campus Response not set."));
                logger.debug("Campus Response not set. Answer was " + answer); //yes, it must have been empty
            }
        });
    });
};

// @function
var postReqCampus = campus.postReqCampus;
