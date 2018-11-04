// AWS Services helper for AWS AI Hackathon
// Ceyhun OZGUN
// August 2018
// https://github.com/ceyhunozgun/awsAIChromeExtension

function AWSServices() {
	
	var dynamodb;
	var s3;

	function initAWS(accessKeyId, secretAccessKey, region) {
		AWS.config.region = region;
		AWS.config.accessKeyId = accessKeyId;
		AWS.config.secretAccessKey = secretAccessKey;
	}

	function initDynamoDB(region) {
		dynamodb = new AWS.DynamoDB.DocumentClient({service: new AWS.DynamoDB({ region: region})});
	}
	
	function initS3(region) {
		s3 = new AWS.S3({ region: region });
	}
	
	function getS3BucketUrl(bucketName) {
		return s3.endpoint.href + bucketName;
	}
	
	function upload(params, handler) {
		s3.upload(params, handler);
	}

	function initServices(region) {
		initDynamoDB(region);
		initS3(region);
	}
	
	function findDynamoDBItem(params, handler) {
		dynamodb.get(params, handler);
	}

	function putDynamoDBItem(params, handler) {
		dynamodb.put(params, handler);
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
		
		// S3 services
		getS3BucketUrl : getS3BucketUrl,
		upload: upload,
		
		// DynamoDB services
		findDynamoDBItem : findDynamoDBItem,
		putDynamoDBItem: putDynamoDBItem
	};
}
