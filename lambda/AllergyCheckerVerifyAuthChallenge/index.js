exports.handler = function(event, context) {
    
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    if (event.request.privateChallengeParameters.answer === event.request.challengeAnswer) {
        event.response.answerCorrect = true;
    } else {
        event.response.answerCorrect = false;
    }
    console.log('Returning response:', JSON.stringify(event.response, null, 2));
    context.done(null, event);    
};
