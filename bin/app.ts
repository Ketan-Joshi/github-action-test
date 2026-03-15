#!/usr/bin/env node
// bin/app.ts
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LandingZoneStack } from '../landing-zone/stacks/landing-zone-stack';
import { EcsAppsStack } from '../ecs-apps/stacks/ecs-apps-stack';
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
