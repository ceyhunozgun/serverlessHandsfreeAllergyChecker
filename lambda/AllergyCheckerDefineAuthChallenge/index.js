exports.handler = function(event, context) {
    
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    var step = event.request.session.length; 
    
    if (step == 0) {
        event.response.issueTokens = false;
        event.response.failAuthentication = false;
        event.response.challengeName = 'CUSTOM_CHALLENGE';
    }
    else if (step == 1 && event.request.session[0].challengeName == 'CUSTOM_CHALLENGE')
    {
        event.response.issueTokens = event.request.session[0].challengeResult;
        event.response.failAuthentication = false;
    }
    else
    {
        event.response.issueTokens = false;
        event.response.failAuthentication = true;
    }
    console.log('Returning response:', JSON.stringify(event.response, null, 2));
    context.done(null, event);
};
