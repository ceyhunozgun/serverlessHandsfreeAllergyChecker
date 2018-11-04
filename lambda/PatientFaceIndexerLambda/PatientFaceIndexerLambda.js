'use strict';

var aws = require('aws-sdk');
 
var rekognition = new aws.Rekognition();

var rekognitionCollectionId = process.env.REKOGNITION_COLLECTION_ID;
var s3BucketName = process.env.S3_BUCKET_NAME;

console.log("Initing PatientFaceIndexer Lambda with rekognitionCollectionId=" + rekognitionCollectionId + ", s3BucketName=" + s3BucketName);

exports.handler = (event, context, callback) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));
    event.Records.forEach((record) => {
        console.log(record.eventID);
        console.log(record.eventName);
        console.log('DynamoDB Record: %j', record.dynamodb);
        
        if (record.eventName !== 'INSERT') {
            console.log('Skipping the Remove event');
            return;
        }

		var params = {
			CollectionId: rekognitionCollectionId, 
			ExternalImageId: record.dynamodb.Keys.patientId.S, 
			Image: {
				S3Object: {
					Bucket: s3BucketName, 
					Name: record.dynamodb.NewImage.s3File.S
				}
			}
		};
		rekognition.indexFaces(params, function(err, data) {
			if (err) { 
				console.log(err, err.stack); // an error occurred
				callback("Can't index face: " + err);
			}
			else {
				var faceId = data.FaceRecords[0].Face.FaceId;
				console.log('Face Id: ' + faceId);
			}
		});
    });
    callback(null, 'Successfully processed ${event.Records.length} records.');
};
