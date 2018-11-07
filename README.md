# Serverless Hands-free Allergy Checker for AWS AI Hackathon 

An allergy checker system designed for emergency services personnel. 
It lets them save and check drug allergy information (caused by medication like aspirin, penicillin, ibuprofen, etc) easily to prevent anaphylactic shocks.
It provides hands-free usage with voice interface and personnel can login with their face and an OTP code.
The OTP code is extracted using text detection.

Allergy information of the patients is saved with the picture of the patient. 
Later that information can be retrieved using face recognition.

The system has been designed as a fully serverless Single Page App (SPA) web-app. It has the following functions:
- Administrator can add and delete emergency personnel (doctors, etc) with their picture.
- Doctors can login with their face and an OTP code sent to their email address.
- Login and in-app functions are completely hands-free using voice interface for the doctors. 
- Doctors can add patients with allergy information and with their picture.
- At a later patient visit, doctors can check allergy information using the picture of the patient easily.

It uses following AWS services:
- [Amazon Polly](https://aws.amazon.com/tr/polly/): For talking to the user
- [Amazon Lex](https://aws.amazon.com/tr/lex/): For accepting voice commands
- [Amazon Rekognition](https://aws.amazon.com/tr/rekognition/) : For recognizing doctors and patients and detecting OTP codes
- [AWS Lambda](http://aws.amazon.com/lambda/): For indexing faces and custom OTP authentication
- [Amazon S3](http://aws.amazon.com/s3/): For storing pictures and web site files
- [Amazon DynamoDB](http://aws.amazon.com/dynamodb/): For storing patient allergy information
- [Amazon Cognito](http://aws.amazon.com/cognito/): For authentication
- [Amazon Simple Email Service (SES)](https://aws.amazon.com/tr/ses/): For sending OTP code emails

## License

Copyright (c) 2018 Ceyhun ÖZGÜN, https://medium.com/@ceyhun.ozgun

This code is licensed under the The MIT License (MIT). Please see the LICENSE file that accompanies this project for the terms of use.

## Installation

An installation script using Bash [install.sh](install.sh) is provided to install and configure all necessary resources in your AWS account:

- the [AWS Identity and Access Management (IAM)](http://aws.amazon.com/iam/) roles for Amazon Cognito and other services
- the [Amazon S3](http://aws.amazon.com/s3/) bucket to save user and patient pictures and to host the HTML pages
- the [Amazon DynamoDB](http://aws.amazon.com/dynamodb/) table for allergy information of patients
- the [Amazon Cognito](http://aws.amazon.com/cognito/) user pool and identity pool
- the [AWS Lambda](http://aws.amazon.com/lambda/) functions for indexing patient faces with DynamoDB and Cognito triggers
- the [Amazon Rekognition](https://aws.amazon.com/tr/rekognition/) face collection to index and search faces using face recognition
- the [Amazon Simple Email Service (SES)](https://aws.amazon.com/tr/ses/) email address to send OTP codes
- the [Amazon Lex](https://aws.amazon.com/tr/lex/) bot for accepting voice commands

The `install.sh` script requires a configured [AWS Command Line Interface (CLI)](http://aws.amazon.com/cli/) and the [jq](http://stedolan.github.io/jq/) tool. 

**Before running the `install.sh` script, set up your configuration in the `config.json` file**:

**ONLY AWS_ACCOUNT_ID, REGION, BUCKET and FROM_ADDRESS are required, for other parameters the default values can be used**

- your AWS account (12-digit number). If an alias happens to be set for your root account, then you will need to go to ***Support > Support Center*** of your AWS Console and find your ***Account Number*** from the top right corner.
- name of your CLI profile. This is the CLI profile that you want to represent while running `./install.sh` from the command-line. This value is usually found in square brackets inside the `~/.aws/credentials` file (`%UserProfile%\.aws\credentials` file in Windows) after installing the AWS CLI tools for your operating system. For more information, you may refer to the section called [Named Profiles](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#cli-multiple-profiles) in the AWS CLI tools [user guide](http://docs.aws.amazon.com/cli/latest/userguide/).
- the AWS region (e.g. "eu-west-1")
- the Amazon S3 bucket to use for the sample HTML pages

- the Amazon DynamoDB patient table name to create

- the Amazon Rekognition face collection name for users
- the Amazon Rekognition face collection name for patients

- the email source for emails (must be [verified](http://docs.aws.amazon.com/ses/latest/DeveloperGuide/verify-email-addresses.html) by Amazon SES)

- the Amazon Cognito user pool name to create
- the Amazon Cognito identity pool name to create
- the IAM policy name to be used
- the IAM role name to be used

- the Amazon Cognito DefineAuthChallenge trigger Lambda name
- the Amazon Cognito CreateAuthChallenge trigger Lambda name
- the Amazon Cognito VerifyAuthChallenge trigger Lambda name
- the Amazon DynamoDB Lambda trigger name to index patient faces

- the web app (http://bucket.s3.amazonaws.com/index.html)

```json
{
  "AWS_ACCOUNT_ID": "123412341234",
  "CLI_PROFILE": "default",
  "REGION": "eu-west-1",
  "BUCKET": "allergychecker-bucket",

  "DDB_TABLE": "AllergyCheckerPatients",

  "USER_FACE_COLLECTION_ID": "allergychecker-users",
  "PATIENT_FACE_COLLECTION_ID": "allergychecker-patients",

  "FROM_ADDRESS": "user@example.com",

  "USER_POOL_NAME": "AllergyCheckerUserPool",
  "ID_POOL_NAME": "AllergyCheckerIdentityPool",
  "POLICY_NAME": "AllergyCheckerPolicy",
  "ROLE_NAME": "AllergyCheckerRole",

  "UP_DEF_AUTH_LAMBDA_NAME": "AllergyCheckerDefineAuthChallenge",
  "UP_CRE_AUTH_LAMBDA_NAME": "AllergyCheckerCreateAuthChallenge",
  "UP_VER_AUTH_LAMBDA_NAME": "AllergyCheckerVerifyAuthChallenge",
  "PATIENT_FACE_INDEXER_LAMBDA_NAME": "AllergyCheckerPatientFaceIndexer"
}

```

After the installation with the `install.sh` script, you should verify the email address you choose to send emails.
AWS SES will send a verification email with a link you can click to verify.

After the email verification, you can start using the app pointing your browser to:

`http://bucket.s3.amazonaws.com/index.html` (replacing `bucket` with your bucket name)

## Usage

### Admin login

First, login with admin account using 'Login With User Name' button to create doctors.
An OTP code will be sent to log you with admin account.
Login with the OTP code.

You can add doctors with their pictures.

### Doctor login

The doctors can login with their faces using 'Login With Face Recognition' button.
The interface is fully hands-free.
Pictures can be taken by saying 'shoot'.

**Please note that for simplicity voice is recorded for 4 seconds and checked for silence.
Speech status is changed from 'Listening' to 'Checking Silence' while checking silence.
Please try to talk only when status is Listening.**

After their users identified with their faces, an OTP code is send to log them in.
The OTP code must be shown to the camera to extract the code using text detection.
If the detected OTP code is validated, they are logged in automatically.

After login, the doctors add or check patients using their voices.
The detailed information about bot commands, sample patient names and sample allergen names are can be found in my previous blog entry [Serverless Allergy Checker with Amazon Rekognition, Lex, Polly, DynamoDB, S3 and Lambda](https://hackernoon.com/serverless-allergy-checker-with-amazon-rekognition-lex-polly-dynamodb-s3-and-lambda-35fd215b51b0).
I have made a few additions which you can the find the details in [the Lex bot export file](lex/AllergyCheckerBot.zip)

### Adding patients

Patients can be added by saying 'add patient'.
When adding a user, a patient name and allergen name is requested.
For patient name, you can say 'tyler','tim', 'addy', 'adam','jack'.
As allergen name, you can say 'aspirin', 'ibuprofen' or 'pennicilin'.
The patient is saved after the picture of the patient is taken.

### Checking patients

Doctors can check whether a patient has a drug allergy by saying 'check patient'
After the picture of the patient is taken, the allergen information is checked and shown if there is any.

### Logging out

Doctors can log out by saying 'log out'

## Uninstallation

**Please remember to delete the created AWS resources if they are not used anymore.**
A Bash script [uninstall.sh](uninstall.sh) is provided to delete the created resources.
Please **be carefull when running this script as it will delete the resources that are configured in config.json file.**

## Thanks

I would like to thank [Danilo Poccia](https://danilop.net/) as I used his init.sh script from his [LambdAuth](https://github.com/danilop/LambdAuth) project to create install.sh.
