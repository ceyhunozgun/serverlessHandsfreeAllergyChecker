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

echo "Deleting SES email address $FROM_ADDRESS ..."
aws ses delete-identity --identity $FROM_ADDRESS --region $REGION

echo "Deleting Identity Pool ..."
aws cognito-identity delete-identity-pool --identity-pool-id `aws cognito-identity list-identity-pools --max-results 50 --region $REGION | jq -r '.IdentityPools[] | select(.IdentityPoolName == "'$ID_POOL_NAME'") .IdentityPoolId'` --region $REGION

echo "Deleting User Pool ..."
aws cognito-idp delete-user-pool --region $REGION --user-pool-id `aws cognito-idp list-user-pools --max-results 50 --region $REGION | jq -r '.UserPools[] | select (.Name =="'$USER_POOL_NAME'") .Id'`

echo "Deleting User Pool Trigger Lambdas ..."
aws lambda delete-function --function-name $UP_DEF_AUTH_LAMBDA_NAME --region $REGION
aws lambda delete-function --function-name $UP_CRE_AUTH_LAMBDA_NAME --region $REGION
aws lambda delete-function --function-name $UP_VER_AUTH_LAMBDA_NAME --region $REGION

echo "Deleting Pool roles and policies ..."
AUTH_POLICY_NAME=${POLICY_NAME}_Cognito_Auth
AUTH_ROLE_NAME=${ROLE_NAME}_Cognito_Auth

UNAUTH_POLICY_NAME=${POLICY_NAME}_Cognito_UnAuth
UNAUTH_ROLE_NAME=${ROLE_NAME}_Cognito_UnAuth

aws iam detach-role-policy \
 --role-name $AUTH_ROLE_NAME \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AUTH_POLICY_NAME

aws iam delete-role --role-name $AUTH_ROLE_NAME
aws iam delete-policy --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$AUTH_POLICY_NAME

aws iam detach-role-policy \
 --role-name $UNAUTH_ROLE_NAME \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$UNAUTH_POLICY_NAME

aws iam delete-role --role-name $UNAUTH_ROLE_NAME
aws iam delete-policy --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$UNAUTH_POLICY_NAME


echo "Deleting Lex bot ..."
aws lex-models delete-bot --name AllergyCheckerBot --region $REGION
sleep 5;
aws lex-models delete-intent --name AddPatient --region $REGION
aws lex-models delete-intent --name CheckPatient --region $REGION
aws lex-models delete-intent --name Shoot --region $REGION
aws lex-models delete-intent --name Logout --region $REGION
sleep 3;
aws lex-models delete-slot-type --name AllergicPersonName --region $REGION
aws lex-models delete-slot-type --name Allergen --region $REGION

echo "Deleting Lambda ..."
ESM_UUID=$(aws lambda list-event-source-mappings --region $REGION | jq -r '.EventSourceMappings[] | select(.FunctionArn | endswith("'$PATIENT_FACE_INDEXER_LAMBDA_NAME'")).UUID')
if [ "$ESM_UUID" != "" ]; then
	aws lambda delete-event-source-mapping --uuid $ESM_UUID --region $REGION
fi
aws lambda delete-function --function-name $PATIENT_FACE_INDEXER_LAMBDA_NAME --region $REGION

echo "Deleting Rekognition face collections ..."
aws rekognition delete-collection --collection-id $USER_FACE_COLLECTION_ID --region $REGION
aws rekognition delete-collection --collection-id $PATIENT_FACE_COLLECTION_ID --region $REGION

echo "Deleting DynamoDB table ..."
aws dynamodb delete-table --table-name $DDB_TABLE --region $REGION

echo "Waiting DynamoDB table deletion to finish ..."
aws dynamodb wait table-not-exists --table-name $DDB_TABLE --region $REGION

echo "Deleting S3 Bucket ..."
aws s3 rm s3://$BUCKET --recursive 
aws s3 rb s3://$BUCKET --force

echo "Deleting IAM policy and role ... "
aws iam detach-role-policy \
 --role-name $ROLE_NAME \
 --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$POLICY_NAME

aws iam delete-role --role-name $ROLE_NAME

aws iam delete-policy --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/$POLICY_NAME

echo "Uninstallation completed."
 