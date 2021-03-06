// This file is part of YABS. See License for more information

/** @module Directives/ARSStudentQuiz */

clientControllers.directive('studentQuiz', ['rooms', 'errorService', function (rooms, errorService) {
	return {
		restrict: 'E',
		templateUrl: 'html/views/partials/ars/quiz/quiz_student.html',
		controller: 'studentQuizController',
		link: {
            pre: function ($scope) {
                $scope.quizSending = false;
                $scope.quizQuestionSelection = 0;
                $scope.quizSelection = "";
                $scope.initLoading = true;

                $scope.resetQuiz = function () {
                    $scope.quizSending = false;
                };

                $scope.sendQuiz = function () {
                    $scope.quizSending = true;
                    var chkQuestions = [];

                    for (var i = 0; i < $scope.quiz.questions.length; i++) {
                        var question = $scope.quiz.questions[i];
                        var chkAnswers = [];
                        for (var j = 0; j < question.quizQuestion.answers.length; j++) {
                            var answer = question.quizQuestion.answers[j];
                            if (answer.radiobox) {
                                if (question.quizQuestion.radioChecked && chkAnswers.indexOf(question.quizQuestion.radioChecked) < 0) {
                                    chkAnswers.push(question.quizQuestion.radioChecked);
                                }
                            } else {
                                if (answer.checked && answer.checked !== false) {
                                    chkAnswers.push(answer._id);
                                }
                            }
                        }
                        chkQuestions.push({question: question._id, answers: chkAnswers});

                    }

                    rooms.answerQuiz($scope.room, $scope.quiz, chkQuestions, function (data) {
                        rooms.getQuiz($scope.quiz, function (data) {
                            for (var i = 0; i < $scope.quizzes.length; i++) {
                                if ($scope.quizzes[i]._id === data.quiz._id) {
                                    /*jshint -W083 */
                                    $scope.$apply(function () {
                                        $scope.quizzes[i].answered = data.quiz.answered;
                                        $scope.quizzes[i].questions = data.quiz.questions;
                                        $scope.resetQuiz();
                                    });
                                }
                            }
                        });
                    });
                };

                $scope.isBad = function (answer) {
                    if ($scope.quiz.questions[$scope.quizQuestionSelection].evaluationUserAnswers) {    
                        for (var idIndex = 0; idIndex < $scope.quiz.questions[$scope.quizQuestionSelection].evaluationUserAnswers.userFalse.length; idIndex++) {
                            if (answer._id === $scope.quiz.questions[$scope.quizQuestionSelection].evaluationUserAnswers.userFalse[idIndex]) {
                                return true;
                            }
                        }
                    }
                    return false;
                };

                $scope.isCorrect = function (answer) {
                    if ($scope.quiz.questions[$scope.quizQuestionSelection].evaluationUserAnswers) {
                        for (var idIndex = 0; idIndex < $scope.quiz.questions[$scope.quizQuestionSelection].evaluationUserAnswers.userRight.length; idIndex++) {
                            if (answer._id === $scope.quiz.questions[$scope.quizQuestionSelection].evaluationUserAnswers.userRight[idIndex]) {
                                return true;
                            }
                        }
                    }
                    return false;
                };

                $scope.changeQuiz = function (selection) {
                    for (var key in $scope.quizzes) {
                        if ($scope.quizzes[key].description === selection) {
                            $scope.quiz = $scope.quizzes[key];
                            break;
                        }
                    }
                };
                $scope.setQuestionSelection = function (number) {
                    $scope.quizQuestionSelection = number;
                };

                $scope.nextQuestion = function () {
                    $scope.quizQuestionSelection += 1;
                };

                $scope.getMyAnswer = function (givenAnswers, answer) {
                    for (var i = 0; i < givenAnswers.length; i++) {
                        if (givenAnswers[i]._id === answer._id) {
                            if (answer.text) {
                                return givenAnswers[i].userText;
                            } else {
                                return "Ja";
                            }
                        }
                    }
                    return "Nein";
                };

                $scope.getCorrectAnswer = function (evaluation, answer) {
                    for (var i = 0; i < evaluation.answers.length; i++) {
                        if (evaluation.answers[i]._id === answer._id) {
                            if (evaluation.answers[i].text) {
                                return evaluation.answers[i].userText;
                            } else {
                                return "Ja";
                            }
                        }
                    }
                    return "Nein";
                };

            },
            post : function ($scope) {
                // do data loading
                rooms.getAllQuizzes($scope.room, function(quizzes){
                    $scope.quizzes = [];
                    var hasActive = false;
                    if (quizzes.quizzes.length === 0) {
                        $scope.initLoading = false;
                    }
                    for (var key in quizzes.quizzes) { //crappy solution but server gives everything, even inactive objects

                        if (quizzes.quizzes[key].active) {
                            hasActive = true;
                            /*jshint -W083 */
                            rooms.getQuiz(quizzes.quizzes[key], function (data) {
                                var newArrayLength = $scope.quizzes.push(quizzes.quizzes[key]);
                                $scope.quizzes[newArrayLength - 1] = data.quiz;
                                $scope.initLoading = false;
                                $scope.$digest();
                            });
                        }
                    }
                    if (!hasActive) {
                        $scope.initLoading = false;
                    }
                    $scope.$digest();
                });


            }
        }
	};
}]);
