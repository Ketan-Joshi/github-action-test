#!/usr/bin/env node
// bin/app.ts
// Single entrypoint — deploys LandingZone first, then all ECS apps.
// Cross-stack references are passed directly (no SSM/import needed).

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { LandingZoneStack } from '../landing-zone/lib/landing-zone-stack';
import { EcsAppsStack } from '../ecs-apps/lib/ecs-apps-stack';
import { config } from '../shared/config';

const app = new cdk.App();

const env = {
  account: config.env.account,
  region: config.env.region,
};

// ── Stack 1: Landing Zone (VPC + Shared ALB) ──────────────
const landingZone = new LandingZoneStack(app, 'LandingZoneStack', {
  env,
  description: 'Landing Zone — VPC, subnets, NAT GW, shared ALB',
  terminationProtection: true,
});

// ── Stack 2: ECS Apps (all services auto-wired from config) ─
// Shared resources are passed directly from the landing zone stack
// avoiding hard-coded ARNs or SSM lookups
new EcsAppsStack(app, 'EcsAppsStack', {
  env,
  description: 'ECS Fargate — all apps sharing one cluster and ALB',
  vpc: landingZone.vpcConstruct.vpc,
  httpsListener: landingZone.albConstruct.httpsListener,
  albSecurityGroup: landingZone.albConstruct.albSecurityGroup,
  hostedZone: landingZone.albConstruct.hostedZone,
  alb: landingZone.albConstruct.alb,
});

app.synth();
