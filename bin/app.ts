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

const prefix = config.envPrefix;

// ── Stack 1: Landing Zone (VPC + Shared ALB) ──────────────
const landingZone = new LandingZoneStack(app, `${prefix}-LandingZoneStack`, {
  env,
  description: `[${prefix}] Landing Zone — VPC, subnets, NAT GW, shared ALB`,
  terminationProtection: prefix === 'prod', // only protect prod
});

// ── Stack 2: ECS Apps ──────────────────────────────────────
new EcsAppsStack(app, `${prefix}-EcsAppsStack`, {
  env,
  description: `[${prefix}] ECS Fargate — all apps sharing one cluster and ALB`,
  vpc: landingZone.vpcConstruct.vpc,
  httpsListener: landingZone.albConstruct.httpsListener,
  albSecurityGroup: landingZone.albConstruct.albSecurityGroup,
  hostedZone: landingZone.albConstruct.hostedZone,
  alb: landingZone.albConstruct.alb,
});

app.synth();