// Script for Serverless Allergy Checker for AWS AI Hackathon
// Ceyhun OZGUN
// October 2018
// https://github.com/ceyhunozgun/


function AllergyChecker(username, name, region, logoutHandler) {
	
	var awsServices = new AWSServices();
	var awsAIServices = new AWSAIServices();
	
	awsServices.initWithCognito(region);
	awsAIServices.initWithCognito(region);
	
	var lastAudioInputId = 0; 
	var lexUserId = 'user' + Math.random();

	var speaker = new Speaker(awsAIServices);	
	var imageCapturer = new ImageCapturer();
	var chatBot = new ChatBot(awsAIServices, LEX_BOT_NAME, lexUserId);

	var audioRecorder;

	function addChatAudioInputLine() {
		var row$ = $('<p id="audioInput' + ++lastAudioInputId + '" class="me">Audio input</p>');
		$('#chat').append(row$);
		$("#chat").scrollTop($("#chat")[0].scrollHeight);
	}
		
	function replaceChatAudioInputLine(txt) {
		$('#audioInput' + lastAudioInputId).html(txt);
	}
		
	function addChatBotResponse(txt) {
		var row$ = $('<p class="bot">' + (txt || '&nbsp;') + '</p>');
		$('#chat').append(row$);
		$("#chat").scrollTop($("#chat")[0].scrollHeight);
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
		
	function setSpeechStatus(txt) {
		$('#speechStatus').html(txt);
	}
	
	function startRecording() {
		audioRecorder.start();
	}
	
	function handleAPIError(msg, err) {
		console.log(err, err.stack);
		playChatText(msg + " What would you like to do ?", startRecording);
	}

	var selectedFlow; // add or check patient;

	var addPatientFlow = (function (awsServices) {
		
		var patientToAdd;
		
		function init(patientInfo) {
			patientToAdd = patientInfo;
			patientToAdd.patientId = "patient_" + (100000 * Math.random());
			imageCapturer.showVideo();
		}
		
		function savePatient(patient) {
			var params = {
				TableName : DDB_TABLE_NAME,
				Item: patient
			};
			awsServices.putDynamoDBItem(params, function(err, data) {
				if (err) {
					handleAPIError("Error while adding patient.", err);
				}
				else {
					playChatText('Patient "' + patient.name + '" added successfully. What would you like to do ?', function () {
						imageCapturer.hideCanvas();
						startRecording();
					});
				}
			});	
		}
		
		function uploadPatientPicture(fileName, imageBlob){
			awsServices.upload({
				Bucket: S3_BUCKET_NAME,
				Key: fileName,
				Body: imageBlob,
				ACL: 'public-read'
			}, function(err, data) {
				if (err) {
					handleAPIError("Error while uploading the picture.", err);
				}
				else {
					var imageUrl = awsServices.getS3BucketUrl(S3_BUCKET_NAME) + "/" + fileName;
		
					patientToAdd.imageUrl = imageUrl;
					patientToAdd.s3File = fileName;
					
					savePatient(patientToAdd);
			   }		 
			});		
		}
	
		function pictureTaken(blob) {
			var fileName =  patientToAdd.patientId + ".png";
			uploadPatientPicture(fileName, blob);
		}
		
		return {
			init: init,
			pictureTaken: pictureTaken
		};
	})(awsServices);
	
	var checkPatientFlow = (function (awsAIServices, awsServices) {
		
		function init() {
			imageCapturer.showVideo();
		}

		function handleGetPatientResponse(patient) {
			if (!patient) {
				playChatText("Patient not found. What would like you to do ?", function () {
					imageCapturer.hideCanvas();
					startRecording();
				});
			}
			else {
				imageCapturer.hideCanvas();
				$("#outputFounded").show();
				$("#photoFounded").attr('src', patient.imageUrl);
				var allergyMessage = 'has no allergy';
				if (patient.allergen !== 'none')
					allergyMessage = 'has allergy to "' + patient.allergen + '"';
				var message = 'Patient "' + patient.name + '" ' + allergyMessage + '. What would you like to do ?';
				playChatText(message, startRecording);
			}
		}
		
		function getPatient(id, handler) {
			var params = {
				TableName : DDB_TABLE_NAME,
				Key: {
					patientId: id
				}
			};
			awsServices.findDynamoDBItem(params, function(err, data) {
				if (err)
					handleAPIError("Error when getting patient info.", err);
				else
					handler(data.Item);
			});	
		}

		
		function checkPatient(blob) {
			var arrayBuffer;
			var fileReader = new FileReader();
			fileReader.onload = function() {
				var arrayBuffer = this.result;
				var params = {
					CollectionId: PATIENT_FACE_COLLECTION_ID, 
					FaceMatchThreshold: 80, 
					Image: {
						Bytes: arrayBuffer
					}, 
					MaxFaces: 1
				};
				awsAIServices.searchFacesByImage(params, function(err, data) {
					if (err)
						handleAPIError("Error when checking patient.", err);
					else {
						var patientId = '';
						if (data.FaceMatches.length == 1)
							patientId = data.FaceMatches[0].Face.ExternalImageId;
						if (patientId == '')
							playChatText("Patient not found. What whould like you to do ?", 
								function () {
									imageCapturer.hideCanvas();
									startRecording();
								}
							);
						else
							getPatient(patientId, handleGetPatientResponse);
					}		
				});
			};
			fileReader.readAsArrayBuffer(blob);
		}
	
		function pictureTaken(blob) {
			playChatText('Checking patient, please wait...', function () {
				checkPatient(blob);
			});
		}

		return {
			init: init,
			pictureTaken: pictureTaken
		};
	})(awsAIServices, awsServices);

	function handleChatResponse(err, data) {
		if (err) {
			alert("Can't send audio : " + err);
			startRecording();
			return;
		}	
		$("#outputFounded").hide();
		replaceChatAudioInputLine(data.inputTranscript);
		if (data.dialogState !== 'ReadyForFulfillment') {
			playChatResponse(data.message, data.audioStream, startRecording);
		}
		else {
			if (data.intentName === 'CheckPatient') {
				playChatText('OK. Say "shoot" to take picture of the patient.', function () {
					selectedFlow = checkPatientFlow;
					selectedFlow.init();
					startRecording();
				});
			}
			else if (data.intentName === 'AddPatient') {
				playChatText('OK. Say "shoot" to take picture of the patient.', function() {
					selectedFlow = addPatientFlow;
					selectedFlow.init({ name: data.slots.PatientName, allergen: data.slots.Allergen });
					startRecording();
				});
			}
			else if (data.intentName === 'Shoot') {
				imageCapturer.capture(function (blob) {
					imageCapturer.hideVideo();
					imageCapturer.showCanvas();
					selectedFlow.pictureTaken(blob);
				});
			}
			else if (data.intentName === 'Logout') {
				playChatText('OK. Good bye.', function() {
					logoutHandler();
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
		audioRecorder.init(function () {
			imageCapturer.init(document.getElementById('pictureGrabber'), 320, 240, 
				function () {
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
		playChatText('Welcome ' + name + '. You can "add patient" or "check patient". What would you like to do ?', 
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
	}
	
	return {
		init: init,
		start: start,
		destroy: destroy
	}
}
