// AWS Cognito User Manager for AWS AI Hackathon
// Ceyhun OZGUN
// October 2018
// https://github.com/ceyhunozgun/

function UserManager(region) {
	
	var awsServices = new AWSServices();
	var awsAIServices = new AWSAIServices();
	
	awsServices.initWithCognito(region);
	awsAIServices.initWithCognito(region);

	var imageCapturer = (function () {

		var videoSource;
		var video;
		var canvas;
		
		var width;
		var height;

		var streaming = false;
		
		function initImageCapture(parentDiv, wdth, hght, initCallback, videoClickedCallback, canvasClickedCallback) {
			
			width = wdth;
			height = hght;
			
			videoSource = document.createElement('select');
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
				video.srcObject = stream;
				video.play();
				if (initCallback)
					initCallback();
			});
			
			if (parentDiv) {
				
				parentDiv.appendChild(video);
				
				canvas.style.display = 'none';
				parentDiv.appendChild(canvas);
			}
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
		
		
		return {
			init: initImageCapture,
			capture: captureImage,
			
			hideCanvas: function () {
				canvas.style.display = 'none';
			},
			showCanvas: function () {
				canvas.style.display = 'inline';
			},
			hideVideo: function () {
				video.style.display = 'none';
			},
			showVideo: function () {
				video.style.display = 'inline';
			},
		};
		
	})();

	function handleAPIError(msg, err) {
		console.log(err, err.stack);
		alert(err);
	}
	
	function addCognitoUser(username, name, email, imageUrl, handler) {
		var cognito = new AWS.CognitoIdentityServiceProvider();
		cognito.adminCreateUser({
			UserPoolId: USER_POOL_ID,
			Username: username,
			UserAttributes: [
				{ Name: 'name', Value: name },
				{ Name: 'email', Value: email},
				{ Name: 'picture', Value: imageUrl }
			],
			MessageAction: 'SUPPRESS'
		}, function (err, data) {
			if (err)
				handleAPIError("Error when getting user info.", err);
			else
				handler(data.Item);
		});
	}
	
	function listCognitoUsers(callback) {
		var cognito = new AWS.CognitoIdentityServiceProvider();
		cognito.listUsers({ 
			UserPoolId: USER_POOL_ID,
		}, callback);
	}
	
	function deleteUser(username, callback) {
		var cognito = new AWS.CognitoIdentityServiceProvider();
		cognito.adminDeleteUser({ 
			UserPoolId: USER_POOL_ID,
			Username: username
		}, callback);
	}

	function indexUserFace(externalImageId, s3BucketName, fileName, callback){
		awsAIServices.indexFaces({
			CollectionId: USER_FACE_COLLECTION_ID,
			ExternalImageId: externalImageId,
			Image: {
				S3Object: {
					Bucket: s3BucketName, 
					Name: fileName
				}
			}
		}, callback);
	}

	function uploadUserPicture(fileName, imageBlob, callback){
		awsServices.upload({
			Bucket: S3_BUCKET_NAME,
			Key: fileName,
			Body: imageBlob,
			ACL: 'public-read'
		}, callback);
	}

	function pictureTaken(blob, userAddedCallback) {
		var username = $('#addUser_username').val();
		var name = $('#addUser_name').val();
		var email = $('#addUser_email').val();
		var fileName =  "user_" + generateId() + ".png";
		
		var imageUrl = awsServices.getS3BucketUrl(S3_BUCKET_NAME) + "/" + fileName;
		
		addCognitoUser(username, name, email, imageUrl, function (err, data) {
			if (err)
				alert(err);
			else {
				var faceExternalImageId = username; // will be used for rekognition ExternalImageId
				
				uploadUserPicture(fileName, blob, function (err) { 
					if (err) {
						alert(err);
					}
					else {
						indexUserFace(faceExternalImageId, S3_BUCKET_NAME, fileName, function (err) {
							if (err)
								alert(err);
							else {
								alert('User added successfully.');
								userAddedCallback();
							}
						});
				   }		 
				});
			}
		});

	}
	
	function generateId() {
		return (Math.floor(100000 + Math.random() * 900000)).toString();
	}

	// Builds the HTML Table out of list.
	function buildHtmlTable(list, columnList, selector, actionHeader, handler) {
		$(selector).empty();
	 
		addAllColumnHeaders(columnList, selector, actionHeader);
		
		for (var i = 0; i < list.length; i++) {
			var row$ = $('<tr/>');
			for (var colIndex = 0; colIndex < columnList.length; colIndex++) {
				var cellValue = list[i][columnList[colIndex]];
				if (cellValue == null) cellValue = "";
				if (columnList[colIndex] == 'imageUrl' && cellValue!=="")
					cellValue = '<img style="border:1px solid gray;" src="' + cellValue + '"/>';
				row$.append($('<td/>').html(cellValue));
			}
			row$.append($('<td>&nbsp;</td>'));
			var btnId = 'rowBtn' + generateId();
			row$.append($('<td><button id="' + btnId + '" data-idx="'+i+'">X</button></td>'));
			$(selector).append(row$);
			
			$('#' + btnId).click(function (event) { 
				handler(parseInt(event.target.dataset.idx));
			});
		}
	}

	// Adds a header row to the table and returns the set of columns.
	// Need to do union of keys from all records as some records may not contain
	// all records.
	function addAllColumnHeaders(columns, selector, actionHeader) {
		var headerTr$ = $('<tr/>');

		for (var i = 0; i < columns.length; i++) {
			headerTr$.append($('<th/>').html(columns[i]));
		}
		headerTr$.append($('<th/>').html("&nbsp;"));
		headerTr$.append($('<th/>').html(actionHeader));
		$(selector).append(headerTr$);
	}
	
	function deleteUserClicked(idx) {
		var username = $('#users-table')[0].childNodes[idx+1].childNodes[0].textContent;
		if (username === 'admin')
			alert("Can't delete admin");
		else if (confirm('Are you sure delete the user ' + username + '?'))
			deleteUser(username, function (err, data) {
				if (err)
					alert(err);
				else
					listUsers();
			});
	} 

    function getAttributeValue(attrs, name) {
    	var value = null;

    	attrs.forEach(function (e) {
    		if (e.Name === name)
    			value = e.Value;
    	})
    	return value;
    }

	function showUsers(res) {
		var users = [];
		
		res.Users.forEach(function (e) {
			users.push({username: e.Username, name: getAttributeValue(e.Attributes, 'name'), email: getAttributeValue(e.Attributes, 'email'), imageUrl: getAttributeValue(e.Attributes, 'picture')}); 
		});
		buildHtmlTable(users, ['username', 'name', 'email', 'imageUrl'], '#users-table', 'Delete User', deleteUserClicked);
	}

	function init(initCallback, userAddedCallback) {
		$('#saveUserBtn').click(function() {
			imageCapturer.capture(function(blob){
				imageCapturer.showCanvas();
				imageCapturer.hideVideo();
				pictureTaken(blob, userAddedCallback);
			});
		});
		$('#addUser_email').val(FROM_ADDRESS);
		imageCapturer.init(document.getElementById('addUserPictureGrabber'), 320, 240, 
			initCallback,
			function () {
			},
			function () {
				imageCapturer.hideCanvas();
				imageCapturer.showVideo();
			}
		);
	}
	function initAddUser() {
		imageCapturer.hideCanvas();
		imageCapturer.showVideo();
	}
	
	function listUsers() {
		listCognitoUsers(function (err, data) {
			if (err)
				alert(err);
			else
				showUsers(data);
		});		
	}
	
	return {
		init: init,
		initAddUser: initAddUser,
		listUsers: listUsers
	}
}
