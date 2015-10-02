/**
 * @module Controllers/courseController
 * @requires Services/authentication
 * @requires Services/rooms
 * @requires Services/rpc
 */

clientControllers.controller("courseController", ["$scope", "$routeParams", "rooms", "$location",
                                                    "authentication", "rpc", "$timeout", "$http",
    function($scope, $routeParams, rooms, $location, authentication, rpc, $timeout, $http) {
        authentication.enforceLoggedIn();
        $scope.Math = window.Math;
        $scope.orderProp = '-votes';
        $scope.authentication = authentication;
        $scope.modules = ["Fragen Übersicht", "Umfragen und Quizfragen Verwaltung"];
        $scope.activeModule = 0;
        $scope.arsNavSelection = 0;

        $scope.$watch(function() { return rooms.getById($routeParams.courseid); }, function(room) {
            $scope.room = room;
            $scope.imageUploads = {};
            $scope.uploading = {};
            $scope.panics = 0;
            $scope.activeUsers = 0;
            $scope.importantQuestions = 0;

            // RPC shouldnt be handled here but is neccessary due to bad server api design (missing room ids in broadcasts)
            rpc.attachFunction("room:livePanic", function(data) {
                $scope.$apply(function() {
                    $scope.panics = data.panics;
                    $scope.activeUsers = data.activeUsers;
                    $scope.importantQuestions = data.importantQuestions;
                });
            });

            rpc.attachFunction("room:panicStatus", function(data) {
                $scope.$apply(function() {
                    $scope.room.isRoomRegistered = data.isEnabled;
                    $scope.room.hasUserPanic = data.hasUserPanic;
                });  
            });

            if($scope.room !== undefined) { // Room might be undefined while loading
                rooms.hasUserAccess($scope.room).then(function(allowed) {
                    if(!allowed) {
                        $window.location = "/";
                    }
                });
                rooms.enter($scope.room);
                rooms.getQuestions($scope.room);    
                $scope.docentLogin = "/roles/admin/" + $scope.room._id;           
                rooms.getAccessLevel($scope.room).then(function(level) {
                    if(level > 1) {
                        $scope.showAdmin = true;
                        rooms.getAllQuizzes($scope.room);
                        rooms.getAllPolls($scope.room);
                    } else {
                        $scope.showAdmin = false;
                    }    
                });
            }
        });
        
        $scope.$watch("room", function(room) {
            for (var i = 0; room !== undefined && i < room.questions.length; i++) {
                room.questions[i].elapsedSince =  (Date.now() - Date.parse(room.questions[i].creationTime)) / (1000 * 60);
                room.questions[i].elapsedSince = Math.ceil(room.questions[i].elapsedSince);
                for (var j = 0; j < room.questions[i].answers.length; j++) {
                  room.questions[i].answers[j].elapsedSince =  (Date.now() - Date.parse(room.questions[i].answers[j].creationTime)) / (1000 * 60);
                  room.questions[i].answers[j].elapsedSince = Math.ceil(room.questions[i].answers[j].elapsedSince);
                }
            }
        }, true);

        /**
         * Adds a Question and delegates to the rooms Service
         */
        $scope.addQuestion = function() {
            if($scope.imageUploads.question === undefined) {
                $scope.imageUploads.question = [];
            }
            rooms.addQuestion($scope.room, this.questionText, $scope.imageUploads.question);
            this.questionText = "";
            $scope.imageUploads.question = undefined;
        };

        /**
         * Answer a Question and delegate work to rooms Service
         * @param {Question} question - answered Question
         */
        $scope.addAnswer = function(question) {
            if($scope.imageUploads[question._id] === undefined) {
                $scope.imageUploads[question._id] = [];
            }            
            rooms.addAnswer($scope.room, question, this.answerText[question._id], $scope.imageUploads[question._id]);
            this.answerText[question._id] = "";
            $scope.imageUploads[question._id] = undefined;
        };

        $scope.voteQuestion = function(question) {
            rooms.voteQuestion($scope.room, question);
        };

        $scope.markAsAnswer = function(question, answer) {
            rooms.markAsAnswer($scope.room, question, answer);
        };        

        $scope.panic = function() {
            rooms.panic($scope.room);
            $scope.room.hasUserPanic = true;
        };

        $scope.unpanic = function() {
            rooms.unpanic($scope.room);
            $scope.room.hasUserPanic = false;
        };

        $scope.enableRoom = function() {
            rooms.enablePanicEvents($scope.room);
        };

        $scope.disableRoom = function() {
            rooms.disablePanicEvents($scope.room);
        };

        $scope.uploadImage = function($event, identifier) {
            // Actually this should be an ng-directive, needs refactoring at some point of time
            var fileInput = jQuery($event.currentTarget.children[0]);
            fileInput.off().on("change", function() {
                var formData = new FormData();
                formData.append("image", this.files[0]);
                $scope.uploading[identifier] = true;
                $http.post("/upload", formData, {
                        headers: {
                            "Content-Type" : undefined
                        },
                        transformRequest: angular.identity
                    }).then(function(response) {
                        if("error" in response) {
                            alert(response.error);
                            $scope.uploading[identifier] = false;
                        }
                        else {
                            if($scope.imageUploads[identifier] === undefined) {
                                $scope.imageUploads[identifier] = [];
                            }
                            $scope.imageUploads[identifier].push(response.data);
                            $scope.uploading[identifier] = false;
                        }
                    });
            });
            $timeout(function() { // Without this the event will be triggered in the current digest, which might blow up things
                fileInput.click(); // and causes an exception
                return true;
            });
        };

        $scope.deleteQuestion = function(question) {
            rooms.deleteQuestion($scope.room, question);
        };

        $scope.deleteAnswer = function(question, answer) {
            rooms.deleteAnswer($scope.room, question, answer);
        };

        $scope.changeDropdownModule = function(position){
            $scope.activeModule = position;
        };

        $scope.deleteQuiz = function(quiz){
            rooms.deleteQuiz($scope.room, quiz, function(bool){
                if(bool){
                    $scope.$apply(function(){
                        $scope.room.quiz.splice($scope.room.quiz.indexOf(quiz),1);
                    });
                }
            });
        };

        $scope.deletePoll = function(poll){
            rooms.deletePoll($scope.room, poll, function(bool){
                if(bool){
                    $scope.$apply(function(){
                        $scope.room.poll.splice($scope.room.poll.indexOf(poll),1);
                    });
                }
            });
        };

        $scope.toggleQuizActivation = function(quiz){
            rooms.toggleQuizActivation($scope.room, quiz, !quiz.active, function(){
                $scope.$apply(function(){
                    quiz.active = !quiz.active;
                });
            });
        };

        $scope.toggleComponentDiscussion = function () {
            rooms.toggleComponentDiscussion($scope.room, $scope.room.config.components.discussions);
        };

        $scope.toggleComponentPanicbutton = function () {
            rooms.toggleComponentPanicbutton($scope.room, $scope.room.config.components.panicbutton);
        };

        $scope.toggleComponentQuiz = function () {
            rooms.toggleComponentQuiz($scope.room, $scope.room.config.components.quiz);
        };

        $scope.toggleUserMayAnswer  = function () {
            rooms.toggleUserMayAnswer($scope.room, $scope.room.config.userMayAnswerToQuestion);
        };

        $scope.toggleQuestionerMayMarkAnswer = function () {
            rooms.toggleQuestionerMayMarkAnswer($scope.room, $scope.room.config.questionerMayMarkAnswer);
        };

        $scope.toggleMuliOptionPanic = function () {
            rooms.toggleMuliOptionPanic($scope.room, $scope.room.config.mulitOptionPanicButton);
        };

        $scope.setPanicThreshold = function () {
            if (!isNaN(parseInt($scope.room.config.thresholdForImportantQuestion))) {
                rooms.setPanicThreshold($scope.room, parseInt($scope.room.config.thresholdForImportantQuestion));
            }
        };

    }
]);