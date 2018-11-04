var aws = require('aws-sdk');

var FROM_ADDRESS = process.env.FROM_ADDRESS;

var ses = new aws.SES();

function sendOTPEmail(fromAddress, to, otpCode, callback) {
    var subject = "Your OTP Code";
    var mailBody = '<html><body><br/>'+
				 '<p style="font-family:tahoma; font-weight: bold; font-size:45px">' + otpCode + '</p>' +
				 "</body></html>";

    var eParams = {
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Body: {
                Html: {
                    Data: mailBody
                }
            },
            Subject: {
                Data: subject
            }
        },
        Source: fromAddress
    };

    ses.sendEmail(eParams, function(err, data){
        if (err) {
            console.log("Can't send email:" + err);
            callback(err);
        }
        else {
            console.log("OTP Code " + otpCode + " sent to " + to);
            callback(null);
        }
    });
}

function generateOtpCode() {
    return (Math.floor(100000 + Math.random() * 900000)).toString();
}

exports.handler = function(event, context, callback) {
    console.log('Received event:', JSON.stringify(event, null, 2));

    if (event.request.challengeName == 'CUSTOM_CHALLENGE') {
        var otpCode = generateOtpCode();
        
        event.response.publicChallengeParameters = {};
        event.response.privateChallengeParameters = {};
        event.response.privateChallengeParameters.answer = otpCode;

        sendOTPEmail(FROM_ADDRESS, event.request.userAttributes.email, otpCode, function() {
            console.log('Returning response:', JSON.stringify(event.response, null, 2));
            callback(null, event);
        })
    }
    else {
        console.log('Returning response:', JSON.stringify(event.response, null, 2));
        callback(null, event);
    }
};
