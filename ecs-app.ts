#!/usr/bin/env node
// bin/ecs-app.ts
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EcsAppStack } from '../ecs-app/lib/ecs-app-stack';
import { config } from '../shared/config';

const app = new cdk.App();

// Import VPC from landing zone stack outputs (cross-stack reference)
// This avoids hard-coding VPC ID and keeps stacks decoupled
const vpc = ec2.Vpc.fromLookup(app, 'ImportedVpc', {
  tags: {
    Project: config.tags.Project,
    ManagedBy: config.tags.ManagedBy,
  },
});

new EcsAppStack(app, 'EcsAppStack', {
  env: config.env,
  vpc,
  description: 'ECS Fargate — Nginx app with ALB and Route53',
});

app.synth();
