#!/bin/bash

aws cloudformation deploy \
  --template-file github-oidc-role.yml \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --profile ketan \
  --parameter-overrides \
    GitHubOrg=Ketan-Joshi \
    GitHubRepo=github-action-test \
    AccountId=$(aws sts get-caller-identity --profile ketan --query Account --output text) \
    CreateOidcProvider=true