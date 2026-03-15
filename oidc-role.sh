#!/bin/bash

aws cloudformation deploy \
  --template-file github-oidc-role.yml \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides GitHubOrg=Ketan-Joshi GitHubRepo=github-action-test