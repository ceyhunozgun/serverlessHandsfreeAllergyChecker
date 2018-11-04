// AWS Cognito authenticator for AWS AI Hackathon
// Ceyhun OZGUN
// October 2018
// https://github.com/ceyhunozgun/

function AWSCognitoAuthenticator(userPoolId, appClientId, idPoolId, region) {

	var userPool;
	var cognitoCallback;
	var cognitoUser;

	function initAWSCognitoCredentials(token, callback) {
		AWS.config.region = region;
		var cfg = {
			IdentityPoolId : idPoolId, // your identity pool id here
			Logins : {}
		};
		cfg.Logins['cognito-idp.'+ region + '.amazonaws.com/' + userPoolId] = token;

		AWS.config.credentials = new AWS.CognitoIdentityCredentials(cfg);
		AWS.config.credentials.clearCachedId();
		AWS.config.credentials = new AWS.CognitoIdentityCredentials(cfg);
		
		//refreshes credentials using AWS.CognitoIdentity.getCredentialsForIdentity()
		AWS.config.credentials.refresh((error) => {
			if (error) {
				 callback.failure(error);
			} else {
				 // Instantiate aws sdk service objects now that the credentials have been updated.
				 // example: var s3 = new AWS.S3();
				 console.log('Successfully logged!');
				 callback.success(cognitoUser);
			}
		});
	}
	
	function CognitoCallback(callback) {
		return {
			onSuccess: function (result) {
				var token = result.getIdToken().getJwtToken();
				console.log('logged in ' + token);
				
				initAWSCognitoCredentials(token, callback);
			},
	 
			onFailure: function(err) {
				callback.failure(err);
			},
			
			customChallenge: function (challengeParameters) {
				callback.customChallengeRequired();
			}
		};
	};
	
	function authenticate(username, callback) {
		var poolData = {
			UserPoolId : userPoolId, // your user pool id here
			ClientId : appClientId // your app client id here
		};
		userPool = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserPool(poolData);
		
		var currentUser = userPool.getCurrentUser();
		if (currentUser != null && currentUser.getUsername() === username) {
			currentUser.getSession(function (err, userSession) {
				if (err)
					callback.failure(err);
				else {
					cognitoUser = currentUser;
					initAWSCognitoCredentials(userSession.getIdToken().getJwtToken(), callback);
				}
			});
			
		}
		else {
			if (currentUser != null)
				currentUser.signOut();

			var userData = {
				Username : username, // your username here
				Pool : userPool
			};
			
			cognitoUser = new AWSCognito.CognitoIdentityServiceProvider.CognitoUser(userData);
			cognitoUser.setAuthenticationFlowType('CUSTOM_AUTH');
			cognitoCallback = new CognitoCallback(callback);

			var authenticationDetails = new AWSCognito.CognitoIdentityServiceProvider.AuthenticationDetails({
				Username : username, // your username here
				Password : "", // your password here
			});

			cognitoUser.initiateAuth(authenticationDetails, cognitoCallback);
		}
	}
	
	function checkOtp(otpCode) {
		cognitoUser.sendCustomChallengeAnswer(otpCode, cognitoCallback);
	}
	
	return {
		authenticate: authenticate,
		checkOtp: checkOtp
	}
};
