// Media manager for AWS AI Hackathon
// Ceyhun OZGUN
// October 2018
// https://github.com/ceyhunozgun/

function Speaker(aiServices) {
	
	function playAudioFromUrl(url, finishHandler) {
		var audio = new Audio(url);
		audio.onended = function() {
			if (finishHandler)
				finishHandler();
		}
		audio.play();
	}
	
	function play(stream, finishHandler) {
		var uInt8Array = new Uint8Array(stream);
		var arrayBuffer = uInt8Array.buffer;
		var blob = new Blob([arrayBuffer]);
		var url = URL.createObjectURL(blob);
		
		playAudioFromUrl(url, finishHandler);
	}
	
	function speak(txt, lang, callback) {
		aiServices.synthesizeSpeech(txt, lang, function (err, data) {
			if (err)
				callback(err, data);
			else
				play(data.AudioStream, callback);
		});
	}

	return {
		speak: speak,
		play: play
	}
}

function AudioRecorder(config, ui) {

	var recorder = {};
	var data = [];
	var destroyed = false;
	var audioStream;

	function stop() {
		if (recorder.state === 'recording')
			recorder.stop();
	}
	
	function start() {
		ui.setSpeechStatus('Listening...');
		recorder.start();
		if (config.autoStopInMS)
			setTimeout(stop, config.autoStopInMS);
	}

	function reSample(audioBuffer, targetSampleRate, onComplete) {
		var channel = audioBuffer.numberOfChannels;
		var samples = audioBuffer.length * targetSampleRate / audioBuffer.sampleRate;
		
		var offlineContext = new OfflineAudioContext(channel, samples, targetSampleRate);
		var bufferSource = offlineContext.createBufferSource();
		bufferSource.buffer = audioBuffer;
		
		bufferSource.connect(offlineContext.destination);
		bufferSource.start(0);
		offlineContext.startRendering().then(function(renderedBuffer){
			onComplete(renderedBuffer);
		})
	}
	
	function removeSilence(floatArr) {
		var l = floatArr.length;
		var nonSilenceStart = 0;
		var nonSilenceEnd = l;
		while (nonSilenceStart < l) {
			if (Math.abs(floatArr[nonSilenceStart]) > config.silenceThreshold)
				break;
			nonSilenceStart++;
		}
		while (nonSilenceEnd > nonSilenceStart) {
			if (Math.abs(floatArr[nonSilenceEnd]) > config.silenceThreshold)
				break;
			nonSilenceEnd--;
		}
		var retFloatArr = floatArr;
		if (nonSilenceStart != 0 || nonSilenceEnd != l) {
			retFloatArr = floatArr.subarray(nonSilenceStart, nonSilenceEnd);
		}
		return retFloatArr;
	}

	function convertFloat32ToInt16(floatArr) {
		var l = floatArr.length;
		var intArr = new Int16Array(l);
		while (l--) {
			intArr[l] = Math.min(1, floatArr[l]) * 0x7FFF;
		}
		return intArr.buffer;
	}
	
	function initStream(stream, callback) {
		audioStream = stream;
		recorder = new MediaRecorder(stream);
		recorder.audioContext = new AudioContext();

		recorder.ondataavailable = function(e) {
			data.push(e.data);
		};

		recorder.onerror = function(e) {
			throw e.error || new Error(e.name);
		}

		recorder.onstart = function(e) {
			data = [];
		}

		recorder.onstop = function(e) {
			if (destroyed) {
				destroyStream();
				return;
			}
			ui.setSpeechStatus('Checking silence...');
			var blobData = new Blob(data, {type: 'audio/x-l16'});
			var reader = new FileReader();

			reader.onload = function() {
				var arrayBuffer = reader.result; 
				recorder.audioContext.decodeAudioData(arrayBuffer, function(audioBuffer) {
					reSample(audioBuffer, config.sampleRate, function(resampledAudioBuffer) {
						var floatArr = resampledAudioBuffer.getChannelData(0);
						if (config.removeSilence)
							floatArr = removeSilence(floatArr);
						config.onAudioRecorded(convertFloat32ToInt16(floatArr));
					});
				});
			};
			reader.readAsArrayBuffer(blobData);
		}
		
		callback();
	}
	
	function init(callback) {
		navigator.mediaDevices.getUserMedia({
			audio: true
		}).then(function (stream) {
			initStream(stream, callback);
		});
	}
	
	function destroy() {
		destroyed = true;
		if (recorder.state === 'recording')
			stop();
		else
			destroyStream();
	}
	
	function destroyStream() {
		audioStream.getTracks().forEach(function(track) {
			track.stop();
		});
	}
	
	return {
		init: init,
		start: start,
		stop: stop,
		destroy: destroy
	};
	
}

function ImageCapturer() {

	var videoStream;
	var video;
	var canvas;
	var parentDiv;
	
	var width;
	var height;

	var streaming = false;
	
	function initImageCapture(prntDiv, wdth, hght, initCallback, videoClickedCallback, canvasClickedCallback) {
		
		parentDiv = prntDiv;
		width = wdth;
		height = hght;
		
		video = document.createElement('video');
		video.style.border = "1px solid black";

		canvas = document.createElement('canvas');
		canvas.style.border = "1px solid red";
		
		video.addEventListener('canplay', function(ev){
			if (!streaming) {
		
				video.setAttribute('width', width);
				video.setAttribute('height', height);
				canvas.setAttribute('width', width);
				canvas.setAttribute('height', height);

				streaming = true;
			}
		}, false);
		
		video.addEventListener('click', videoClickedCallback);
		canvas.addEventListener('click', canvasClickedCallback);
		
		var constraints = {
			audio: false,
			video: true
		};
				
		navigator.mediaDevices.getUserMedia(constraints).then(function onSuccess(stream) {
			videoStream = stream;
			video.srcObject = stream;
			video.play();
			initCallback();
		});
		
		video.style.display = 'none';
		parentDiv.appendChild(video);
		
		canvas.style.display = 'none';
		parentDiv.appendChild(canvas);
	}
	
	function stop() {
		video.pause();
	}

	function hideCanvas() {
			canvas.style.display = 'none';
	}
	function showCanvas() {
		canvas.style.display = 'inline';
	}
	function hideVideo() {
		video.style.display = 'none';
	}
	function showVideo() {
		video.style.display = 'inline';
	}

	function captureImage(callback) {
		var context = canvas.getContext('2d');
		
		if (width && height) {
			canvas.width = width;
			canvas.height = height;
			context.drawImage(video, 0, 0, width, height);
			
			canvas.toBlob(function (blob) {
				callback(blob);
			});
		}
	}
	
	function destroy() {
		stop();
		destroyStream();
		destroyElements();
	}
	
	function destroyElements() {
		parentDiv.removeChild(canvas);
		parentDiv.removeChild(video);
	}
	
	function destroyStream() {
		videoStream.getTracks().forEach(function(track) {
			track.stop();
		});
	}

	return {
		init: initImageCapture,
		capture: captureImage,
		destroy: destroy,
		
		hideCanvas: hideCanvas,
		showCanvas: showCanvas,
		hideVideo: hideVideo,
		showVideo: showVideo
	};
}

function ChatBot(aiServices, botName, lexUserId) {
	
	function sendAudioToLex(audioData, handler) {
		var params = {
			botName: botName,
			userId: lexUserId,
			inputStream: audioData
		};
		
		aiServices.sendAudioToChatBot(params, handler);
	}
	
	function sendTextToLex(txt, handler) {
		var params = {
			botName: botName,
			userId: lexUserId,
			inputText: txt
		};
		
		aiServices.sendTextToChatBot(params, handler);
	}
	
	return {
		sendAudio: sendAudioToLex,
		sendText: sendTextToLex
	};
}

