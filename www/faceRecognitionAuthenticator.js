// Face recognition authenticator for AWS AI Hackathon
// Ceyhun OZGUN
// October 2018
// https://github.com/ceyhunozgun/

function FaceRecognitionAuthenticator(idPoolId, region) {
	
	var awsServices = new AWSServices();
	var awsAIServices = new AWSAIServices();
	
	awsServices.initWithIdentityPool(idPoolId, region);
	awsAIServices.initWithIdentityPool(idPoolId, region);
	
	var authenticator;
	
	function loginWithUsername(username, callback) {
		authenticator = new AWSCognitoAuthenticator(USER_POOL_ID, APP_CLIENT_ID, IDENTITY_POOL_ID, AWS_REGION);
		authenticator.authenticate(username, callback);
	}

	var lastAudioInputId = 0; 
	var lexUserId = 'user' + Math.random();

	var speaker = new Speaker(awsAIServices);	
	var imageCapturer = new ImageCapturer();
	var chatBot = new ChatBot(awsAIServices, LEX_BOT_NAME, lexUserId);

	var audioRecorder;

	function addChatAudioInputLine() {
		var row$ = $('<p id="audioInput' + ++lastAudioInputId + '" class="me">Audio input</p>');
		$('#lwFRchat').append(row$);
		$("#lwFRchat").scrollTop($("#lwFRchat")[0].scrollHeight);
	}
		
	function replaceChatAudioInputLine(txt) {
		$('#audioInput' + lastAudioInputId).html(txt);
	}
		
	function addChatBotResponse(txt) {
		var row$ = $('<p class="bot">' + (txt || '&nbsp;') + '</p>');
		$('#lwFRchat').append(row$);
		$("#lwFRchat").scrollTop($("#lwFRchat")[0].scrollHeight);
	}
		
	function playChatResponse(txt, stream, callback) {
		setSpeechStatus('Speaking...');
		addChatBotResponse(txt);
		speaker.play(stream, callback);
	}
		
	function playChatText(txt, callback) {
		setSpeechStatus('Speaking...');
		addChatBotResponse(txt);
		speaker.speak(txt, 'en', callback);
	}
	
	function clearChatHistory() {
		$('#lwFRchat').html('');
	}
		
	function setSpeechStatus(txt) {
		$('#lwFRspeechStatus').html(txt);
	}
	
	function startRecording() {
		audioRecorder.start();
	}
	
	function handleAPIError(msg, err) {
		console.log(err, err.stack);
		imageCapturer.hideCanvas();
		imageCapturer.showVideo();

		playChatText(msg + " Please try again.", startRecording);
	}

	var checkOtpFlow = (function (awsServices) {
		
		function init() {
		}
		
		function extractOtpCode(str) {
			const regex = /(\d{6})|(\d{3})\s*(\d{3})/;
			let m;
			var res = [];

			if ((m = regex.exec(str)) !== null) {
				m.forEach((match, groupIndex) => {
					res.push(match);
				});
			}
			var extracted = '';
			if (res && res.length == 4) {
				if (res[1])
					extracted = res[1];
				else
					extracted = res[2] + res[3];
			}
			return extracted;
		}
		
		function divideCode(code) {
			return code.substring(0, 3) + ' ' + code.substring(3, 6); 
		}

		
		function detectOtpCode(blob) {
			awsAIServices.detectTextInImage(blob, function(err, data) {
				if (err)
					handleAPIError("Error when detecting otp code.", err);
				else {
					var txt = data;
					
					var otpCode = extractOtpCode(txt);
					if (otpCode !== '') {
						playChatText('Checking your OTP code "' + divideCode(otpCode) + '" , please wait...', function () {
							authenticator.checkOtp(otpCode);
						});
					}
					else {
						playChatText("Can't detect OTP code, please try again.", function () {
							imageCapturer.hideCanvas();
							imageCapturer.showVideo();

							startRecording();
						});
					}
				}		
			});
		}
	
		function pictureTaken(blob) {
			playChatText('Detecting your OTP code, please wait...', function () {
				detectOtpCode(blob);
			});
		}
		
		return {
			init: init,
			pictureTaken: pictureTaken
		};
	})(awsServices);
	
	var checkUserFlow = (function (awsAIServices, awsServices) {
		
		function init() {
		}

		function checkUserAuth(username) {
			playChatText('Logging you in as "' + username + '", please wait...', function() {
				loginWithUsername(username, {
					success: function (cognitoUser) {
						playChatText("Logged in successfully.", function () {
							clearChatHistory();
							imageCapturer.hideCanvas();
							imageCapturer.showVideo();
							selectedFlow = checkUserFlow;
							selectedFlow.init();
							loggedIn(cognitoUser);
						});
					},
					failure: function (err) {
						alert(err);
						imageCapturer.hideCanvas();
						imageCapturer.showVideo();
						selectedFlow = checkUserFlow;
						selectedFlow.init();
					},
					customChallengeRequired: function () {
						selectedFlow = checkOtpFlow;
						selectedFlow.init();
						playChatText("I have sent a code to log you in. Please show your code to the camera and say 'shoot'.", function () {
							imageCapturer.hideCanvas();
							imageCapturer.showVideo();
							
							startRecording();
						});
					}
				});
			});
		}
		
		function checkUser(blob) {
			var arrayBuffer;
			var fileReader = new FileReader();
			fileReader.onload = function() {
				var arrayBuffer = this.result;
				var params = {
					CollectionId: USER_FACE_COLLECTION_ID, 
					FaceMatchThreshold: 80, 
					Image: {
						Bytes: arrayBuffer
					}, 
					MaxFaces: 1
				};
				awsAIServices.searchFacesByImage(params, function(err, data) {
					if (err)
						handleAPIError("Error when checking user.", err);
					else {
						var username = '';
						if (data.FaceMatches.length == 1)
							username = data.FaceMatches[0].Face.ExternalImageId;
						if (username == '')
							playChatText("Can not recognize your face. Please try again.", 
								function () {
									imageCapturer.hideCanvas();
									imageCapturer.showVideo();

									startRecording();
								}
							);
						else
							checkUserAuth(username);
					}		
				});
			};
			fileReader.readAsArrayBuffer(blob);
		}
	
		function pictureTaken(blob) {
			playChatText('Checking your face, please wait...', function () {
				checkUser(blob);
			});
		}

		return {
			init: init,
			pictureTaken: pictureTaken
		};
	})(awsAIServices, awsServices);

	var selectedFlow; // check user or check otp code;

	function handleChatResponse(err, data) {
		if (err) {
			alert("Can't send audio : " + err);
			startRecording();
			return;
		}	
		replaceChatAudioInputLine(data.inputTranscript);
		if (data.dialogState !== 'ReadyForFulfillment') {
			playChatResponse(data.message, data.audioStream, startRecording);
		}
		else {
			if (data.intentName === 'Shoot') {
				imageCapturer.capture(function (blob) {
					imageCapturer.hideVideo();
					imageCapturer.showCanvas();
					selectedFlow.pictureTaken(blob);
				});
			}
		}
	}
	
	var audioRecorderConfig = { 
		autoStopInMS: 4000, 
		removeSilence: true, 
		silenceThreshold: 0.26, 
		sampleRate: 16000, 
		onAudioRecorded: function (arrayBuffer) {
			
			if (arrayBuffer.byteLength > 0) { // if it is not fully silence, send it to Lex
				
				setSpeechStatus('Analyzing...');
				addChatAudioInputLine();
				
				chatBot.sendAudio(arrayBuffer, handleChatResponse);
			}
			else
				startRecording();
		}
	};

	audioRecorder = new AudioRecorder(audioRecorderConfig, {
		setSpeechStatus: function (s) {
			setSpeechStatus(s);
		}
	});
	
	function init(callback) {
		selectedFlow = checkUserFlow;
		selectedFlow.init();

		audioRecorder.init(function () {
			imageCapturer.init(document.getElementById('lwFRPictureGrabber'), 320, 240, 
				function () {
					imageCapturer.showVideo();
					callback();
				},
				function () {
				},
				function () {
				}
			);
		});
	}
	
	function start() {
		playChatText('Welcome. Look at the camera and say "shoot" to login.', 
			function (err) {
				if (err)
					alert(err);
				else
					startRecording();
			}
		);
	}
	
	function destroy() {
		audioRecorder.destroy();
		imageCapturer.destroy();
		$('#lwFRchat').html('');
	}
	
	return {
		init: init,
		start: start,
		destroy: destroy
	}
}
