#!/bin/bash

# Check if the AWS CLI is in the PATH
found=$(which aws)
if [ -z "$found" ]; then
  echo "Please install the AWS CLI under your PATH: http://aws.amazon.com/cli/"
  exit 1
fi

# Check if jq is in the PATH
found=$(which jq)
if [ -z "$found" ]; then
  echo "Please install jq under your PATH: http://stedolan.github.io/jq/"
  exit 1
fi

# Read other configuration from config.json
AWS_ACCOUNT_ID=$(jq -r '.AWS_ACCOUNT_ID' config.json)
CLI_PROFILE=$(jq -r '.CLI_PROFILE // empty' config.json)
REGION=$(jq -r '.REGION' config.json)
BUCKET=$(jq -r '.BUCKET' config.json)
DDB_TABLE=$(jq -r '.DDB_TABLE' config.json)
USER_FACE_COLLECTION_ID=$(jq -r '.USER_FACE_COLLECTION_ID' config.json)
PATIENT_FACE_COLLECTION_ID=$(jq -r '.PATIENT_FACE_COLLECTION_ID' config.json)
POLICY_NAME=$(jq -r '.POLICY_NAME' config.json)
PATIENT_FACE_INDEXER_LAMBDA_NAME=$(jq -r '.PATIENT_FACE_INDEXER_LAMBDA_NAME' config.json)
ROLE_NAME=$(jq -r '.ROLE_NAME' config.json)
FROM_ADDRESS=$(jq -r '.FROM_ADDRESS' config.json)
USER_POOL_NAME=$(jq -r '.USER_POOL_NAME' config.json)
UP_DEF_AUTH_LAMBDA_NAME=$(jq -r '.UP_DEF_AUTH_LAMBDA_NAME' config.json)
UP_CRE_AUTH_LAMBDA_NAME=$(jq -r '.UP_CRE_AUTH_LAMBDA_NAME' config.json)
UP_VER_AUTH_LAMBDA_NAME=$(jq -r '.UP_VER_AUTH_LAMBDA_NAME' config.json)
ID_POOL_NAME=$(jq -r '.ID_POOL_NAME' config.json)

#if a CLI Profile name is provided... use it.
if [[ ! -z "$CLI_PROFILE" ]]; then
  echo "setting session CLI profile to $CLI_PROFILE"
  export AWS_DEFAULT_PROFILE=$CLI_PROFILE
fi

echo "Creating IAM policy $POLICY_NAME and role $ROLE_NAME ..."
aws iam create-policy --policy-name $POLICY_NAME \
 --policy-document file://iam/iam-policy-auth.json

aws iam create-role \
 --role-name $ROLE_NAME \
 --assume-role-policy-document file://iam/iam-lambda-trust-policy.json

aws iam attach-role-policy \
 --role-name $ROLE_NAME \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$POLICY_NAME 

echo "Creating S3 Bucket $BUCKET at $REGION ..."
aws s3api create-bucket \
 --bucket $BUCKET \
 --create-bucket-configuration LocationConstraint=$REGION \
 --region $REGION

aws s3api put-bucket-cors \
 --bucket $BUCKET \
 --cors-configuration file://s3-bucket-cors.json \
 --region $REGION

echo "Creating DynamoDB Table $DDB_TABLE ..."
aws dynamodb create-table \
 --table-name $DDB_TABLE \
 --attribute-definitions AttributeName=patientId,AttributeType=S \
 --key-schema AttributeName=patientId,KeyType=HASH \
 --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
 --region $REGION

echo "Waiting DynamoDB table creation to finish ..."
aws dynamodb wait table-exists --table-name $DDB_TABLE

aws dynamodb update-table \
 --table-name $DDB_TABLE \
 --stream-specification "StreamEnabled=true,StreamViewType=NEW_IMAGE" \
 --region $REGION

DDB_TABLE_STREAM_ARN=$(aws dynamodb describe-table --table-name $DDB_TABLE --region $REGION --query 'Table.LatestStreamArn' --output text)

 
echo "Creating Rekognition face collections $USER_FACE_COLLECTION_ID , $PATIENT_FACE_COLLECTION_ID ..."
aws rekognition create-collection --collection-id $USER_FACE_COLLECTION_ID --region $REGION
aws rekognition create-collection --collection-id $PATIENT_FACE_COLLECTION_ID --region $REGION

echo "Creating Lambda function $PATIENT_FACE_INDEXER_LAMBDA_NAME ..."
aws lambda create-function \
 --function-name $PATIENT_FACE_INDEXER_LAMBDA_NAME \
 --runtime nodejs6.10 \
 --role arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME \
 --handler PatientFaceIndexerLambda.handler \
 --region $REGION \
 --zip-file fileb://lambda/PatientFaceIndexerLambda/PatientFaceIndexerLambda.zip \
 --environment Variables="{REKOGNITION_COLLECTION_ID=$PATIENT_FACE_COLLECTION_ID,S3_BUCKET_NAME=$BUCKET}"

aws lambda create-event-source-mapping \
 --event-source-arn $DDB_TABLE_STREAM_ARN\
 --function-name $PATIENT_FACE_INDEXER_LAMBDA_NAME \
 --batch-size 1 \
 --starting-position LATEST \
 --region $REGION
 
echo "Importing Lex bot AllergyCheckerBot ..."
LEX_BOT_IMPORT_ID=$(aws lex-models start-import --payload fileb://lex/AllergyCheckerBot.zip --resource-type BOT --merge-strategy FAIL_ON_CONFLICT --region $REGION --query 'importId' --output text)

echo "Checking Lex bot import status ..."
while :
do
	BOT_IMPORT_STATUS=$(aws lex-models get-import --import-id $LEX_BOT_IMPORT_ID --region $REGION --query 'importStatus' --output text)
	if [ "$BOT_IMPORT_STATUS" != "IN_PROGRESS" ]; then
		break
	fi
done

if [ "$BOT_IMPORT_STATUS" == "COMPLETE" ]; then
	echo "Lex bot import succeeded. Building the bot ..."
	aws lex-models get-bot --region $REGION --name AllergyCheckerBot --version-or-alias "\$LATEST" > lex/bot_info.js
	sed '/\"status\"/d' lex/bot_info.js | sed '/\"version\"/d' | sed '/\"lastUpdatedDate\"/d' | sed '/\"createdDate\"/d' > lex/bot_info_edited.js
	aws lex-models put-bot --region $REGION --name AllergyCheckerBot --locale en-US --no-child-directed --cli-input-json file://lex/bot_info_edited.js --process-behavior BUILD

	while :
	do
		BOT_BUILD_STATUS=$(aws lex-models get-bot --region $REGION --name AllergyCheckerBot --version-or-alias "\$LATEST" --query 'status' --output text)
		if [ "$BOT_BUILD_STATUS" != "BUILDING" ] && [ "$BOT_BUILD_STATUS" != "NOT_BUILT" ]; then
			break;
		fi
	done

	if [ "$BOT_BUILD_STATUS" = "FAILED" ]; then
		echo "Lex bot build failed. Check failureReason below:"
		aws lex-models get-bot --region $REGION --name AllergyCheckerBot --version-or-alias "\$LATEST"
	else
		echo "Lex bot build succeeded"
	fi
	
	rm lex/bot_info.js lex/bot_info_edited.js
else
	echo "Lex bot import failed. Check failureReason below:"
	aws lex-models get-import --import-id $LEX_BOT_IMPORT_ID --region $REGION
fi

echo "Creating Identity Pool Roles ..."
AUTH_POLICY_NAME=${POLICY_NAME}_Cognito_Auth
AUTH_ROLE_NAME=${ROLE_NAME}_Cognito_Auth

UNAUTH_POLICY_NAME=${POLICY_NAME}_Cognito_UnAuth
UNAUTH_ROLE_NAME=${ROLE_NAME}_Cognito_UnAuth

echo "Creating User Pool and Identity Pool ..."
USER_POOL_ID=$(aws cognito-idp create-user-pool \
 --pool-name $USER_POOL_NAME \
 --admin-create-user-config AllowAdminCreateUserOnly=true \
 --schema Name=name,AttributeDataType=String,Required=true Name=picture,AttributeDataType=String,Required=true Name=email,AttributeDataType=String,Required=true \
 --auto-verified-attributes email \
 --lambda-config DefineAuthChallenge=arn:aws:lambda:$REGION:$AWS_ACCOUNT_ID:function:$UP_DEF_AUTH_LAMBDA_NAME,CreateAuthChallenge=arn:aws:lambda:$REGION:$AWS_ACCOUNT_ID:function:$UP_CRE_AUTH_LAMBDA_NAME,VerifyAuthChallengeResponse=arn:aws:lambda:$REGION:$AWS_ACCOUNT_ID:function:$UP_VER_AUTH_LAMBDA_NAME \
 --region $REGION \
 --query 'UserPool.Id' --output text)
 
APP_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
 --user-pool-id $USER_POOL_ID \
 --client-name allergycheckerappclient \
 --no-generate-secret \
 --region $REGION \
 --query 'UserPoolClient.ClientId' --output text)

COGN_PRVDR_NAME="cognito-idp.$REGION.amazonaws.com/$USER_POOL_ID"
IDENTITY_POOL_ID=$(aws cognito-identity create-identity-pool \
 --identity-pool-name $ID_POOL_NAME \
 --allow-unauthenticated-identities \
 --cognito-identity-providers ProviderName=$COGN_PRVDR_NAME,ClientId=$APP_CLIENT_ID \
 --region $REGION \
 --query 'IdentityPoolId' --output text)

roles='{"unauthenticated":"arn:aws:iam::'"$AWS_ACCOUNT_ID"':role/'"$UNAUTH_ROLE_NAME"'","authenticated":"arn:aws:iam::'"$AWS_ACCOUNT_ID"':role/'"$AUTH_ROLE_NAME"'"}'
echo "Roles: $roles"
aws cognito-identity set-identity-pool-roles \
  --identity-pool-id $IDENTITY_POOL_ID \
  --roles $roles \
  --region $REGION

sed -e "s/<IDENTITY_POOL_ID>/$IDENTITY_POOL_ID/g" \
  iam/trust_policy_cognito_auth.json > iam/edited_trust_policy_cognito_auth.json
sed -e "s/<IDENTITY_POOL_ID>/$IDENTITY_POOL_ID/g" \
  iam/trust_policy_cognito_unauth.json > iam/edited_trust_policy_cognito_unauth.json

aws iam create-policy --policy-name $AUTH_POLICY_NAME \
 --policy-document file://iam/iam-policy-auth.json
aws iam create-role \
 --role-name $AUTH_ROLE_NAME \
 --assume-role-policy-document file://iam/edited_trust_policy_cognito_auth.json
aws iam attach-role-policy \
 --role-name $AUTH_ROLE_NAME \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AUTH_POLICY_NAME 

aws iam create-policy --policy-name $UNAUTH_POLICY_NAME \
 --policy-document file://iam/iam-policy-unauth.json
aws iam create-role \
 --role-name $UNAUTH_ROLE_NAME \
 --assume-role-policy-document file://iam/edited_trust_policy_cognito_unauth.json
aws iam attach-role-policy \
 --role-name $UNAUTH_ROLE_NAME \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$UNAUTH_POLICY_NAME 

rm iam/edited_trust_policy_cognito_unauth.json iam/edited_trust_policy_cognito_auth.json
 
echo "Creating Lambda triggers for User Pool ..."

aws lambda create-function \
 --function-name $UP_DEF_AUTH_LAMBDA_NAME \
 --runtime nodejs6.10 \
 --role arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME \
 --handler index.handler \
 --region $REGION \
 --zip-file fileb://lambda/AllergyCheckerDefineAuthChallenge/index.zip

aws lambda add-permission \
 --function-name arn:aws:lambda:$REGION:$AWS_ACCOUNT_ID:function:$UP_DEF_AUTH_LAMBDA_NAME \
 --statement-id 1 \
 --action lambda:InvokeFunction \
 --principal cognito-idp.amazonaws.com \
 --source-arn arn:aws:cognito-idp:$REGION:$AWS_ACCOUNT_ID:userpool/$USER_POOL_ID \
 --region $REGION
 
 aws lambda create-function \
 --function-name $UP_CRE_AUTH_LAMBDA_NAME \
 --runtime nodejs6.10 \
 --role arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME \
 --handler index.handler \
 --region $REGION \
 --zip-file fileb://lambda/AllergyCheckerCreateAuthChallenge/index.zip \
 --environment Variables="{FROM_ADDRESS=$FROM_ADDRESS}"

aws lambda add-permission \
 --function-name arn:aws:lambda:$REGION:$AWS_ACCOUNT_ID:function:$UP_CRE_AUTH_LAMBDA_NAME \
 --statement-id 1 \
 --action lambda:InvokeFunction \
 --principal cognito-idp.amazonaws.com \
 --source-arn arn:aws:cognito-idp:$REGION:$AWS_ACCOUNT_ID:userpool/$USER_POOL_ID \
 --region $REGION
 
 aws lambda create-function \
 --function-name $UP_VER_AUTH_LAMBDA_NAME \
 --runtime nodejs6.10 \
 --role arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME \
 --handler index.handler \
 --region $REGION \
 --zip-file fileb://lambda/AllergyCheckerVerifyAuthChallenge/index.zip

aws lambda add-permission \
 --function-name arn:aws:lambda:$REGION:$AWS_ACCOUNT_ID:function:$UP_VER_AUTH_LAMBDA_NAME \
 --statement-id 1 \
 --action lambda:InvokeFunction \
 --principal cognito-idp.amazonaws.com \
 --source-arn arn:aws:cognito-idp:$REGION:$AWS_ACCOUNT_ID:userpool/$USER_POOL_ID \
 --region $REGION

echo "Creating admin user ..."
aws cognito-idp admin-create-user \
 --user-pool-id $USER_POOL_ID \
 --username admin \
 --message-action SUPPRESS \
 --user-attributes Name=email,Value=$FROM_ADDRESS Name=email_verified,Value=true \
 --region $REGION
 
echo "Creating config.js ..."
echo "var AWS_REGION = '$REGION';" > www/config.js
echo "var S3_BUCKET_NAME = '$BUCKET';" >> www/config.js
echo "var USER_FACE_COLLECTION_ID = '$USER_FACE_COLLECTION_ID';" >> www/config.js
echo "var PATIENT_FACE_COLLECTION_ID = '$PATIENT_FACE_COLLECTION_ID';" >> www/config.js
echo "var DDB_TABLE_NAME = '$DDB_TABLE';" >> www/config.js
echo "var LEX_BOT_NAME = 'AllergyCheckerBot';" >> www/config.js
echo "var USER_POOL_ID = '$USER_POOL_ID';" >> www/config.js
echo "var APP_CLIENT_ID = '$APP_CLIENT_ID';" >> www/config.js
echo "var IDENTITY_POOL_ID = '$IDENTITY_POOL_ID';" >> www/config.js
echo "var FROM_ADDRESS = '$FROM_ADDRESS';" >> www/config.js

echo "Sending www content to S3 bucket $BUCKET ..."
aws s3 sync www s3://$BUCKET --cache-control max-age=10 --acl public-read

echo "Starting SES email verification for $FROM_ADDRESS."
aws ses verify-email-identity --email-address $FROM_ADDRESS --region $REGION

echo "Installation completed. You can use the app at https://$BUCKET.s3.amazonaws.com/index.html . Please remember to verify your email address $FROM_ADDRESS "
echo "You should verify the address to be able to send OTP emails by clicking the verification link when you have received a verification email."
