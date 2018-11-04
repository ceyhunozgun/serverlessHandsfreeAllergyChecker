// AWS AI Services helper for AWS AI Hackathon
// Ceyhun OZGUN
// October 2018
// https://github.com/ceyhunozgun/

function AWSAIServices() {
	
	var polly;
	var rekognition;
	var lex;

	var voices = {
		'en': 'Joanna',
		'es': 'Penelope',
		'tr': 'Filiz',
		'fr': 'Lea',
		'de': 'Vicki',
		'it': 'Carla'
	};

	function initAWS(accessKeyId, secretAccessKey, region) {
		AWS.config.region = region;
		AWS.config.accessKeyId = accessKeyId;
		AWS.config.secretAccessKey = secretAccessKey;
	}

	function initPolly(region) {
		polly = new AWS.Polly({ region: region});
	}

	function initRekognition(region) {
		rekognition = new AWS.Rekognition({ region: region});
	}
	
	function initLex(region) {
		lex = new AWS.LexRuntime({
			region: region
		});
	}
	
	function synthesizeSpeech(txt, lang, callback) {
		lang = lang || 'en';
		var params = {
			OutputFormat: 'mp3',
			Text: txt,
			VoiceId: voices[lang]
		};
		
		polly.synthesizeSpeech(params, callback);		
	}

	function searchFacesByImage(params, handler) {
		rekognition.searchFacesByImage(params, handler);
	}

	function indexFaces(params, handler) {
		rekognition.indexFaces(params, handler);
	}
	
	function detectTextInImage(blob, callback) {
		var arrayBuffer;
		var fileReader = new FileReader();
		
		fileReader.onload = function() {
			var arrayBuffer = this.result;
			var params = {
				Image: {
					Bytes: arrayBuffer
				}
			};
			rekognition.detectText(params, function(err, data) {
				if (err) {
					console.log(err, err.stack);
					callback(err, null);
				}
				else {
					var text = '';
					for (var i = 0; i < data.TextDetections.length; i++) {
						var td = data.TextDetections[i];
						if (td.Type == "LINE")
							text += td.DetectedText + "\n";
					}
					callback(null, text);
				}		
			});
		};
		fileReader.readAsArrayBuffer(blob);
	}
	
	function sendAudioToChatBot(params, handler) {
		params.botAlias = params.botAlias || '$LATEST';
		params.contentType = params.contentType || 'audio/x-l16; sample-rate=16000';
		params.accept = params.accept || 'audio/mpeg';
		lex.postContent(params, handler);
	}
	
	function sendTextToChatBot(params, handler) {
		params.botAlias = params.botAlias || '$LATEST';
		lex.postText(params, handler);
	}

	function initServices(region) {
		initPolly(region);
		initRekognition(region);
		initLex(region);
	}

	function initWithKeyAndSecret(key, secret, region) {
		if (key && key != '') 
			initAWS(key, secret, region);
		initServices(region);
	}
	
	function initWithIdentityPool(idPoolId, region) {
		AWS.config.region = region;
		AWS.config.credentials = new AWS.CognitoIdentityCredentials({
			IdentityPoolId: idPoolId
		});
		initServices(region);
	}

	function initWithCognito(region) {
		initServices(region);
	}
	
	return {
		// Initialization services
		initWithKeyAndSecret: initWithKeyAndSecret,
		initWithIdentityPool: initWithIdentityPool,
		initWithCognito: initWithCognito,
		
		// Polly services
		synthesizeSpeech : synthesizeSpeech,

		
		// Rekognition services
		searchFacesByImage: searchFacesByImage,
		detectTextInImage: detectTextInImage,
		indexFaces: indexFaces,
		
		// Lex services
		sendAudioToChatBot: sendAudioToChatBot,
		sendTextToChatBot: sendTextToChatBot
	};
}
