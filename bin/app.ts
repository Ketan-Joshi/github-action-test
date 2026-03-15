#!/usr/bin/env node
// bin/app.ts
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LandingZoneStack } from '../landing-zone/stacks/landing-zone-stack';
import { EcsClusterStack } from '../ecs-apps/stacks/ecs-cluster-stack';
import { EcsServiceStack } from '../ecs-apps/stacks/ecs-service-stack';
import { config } from '../shared/config';

const app = new cdk.App();

// Guard — fail fast if account/region are not set
if (!config.env.account || !config.env.region) {
  throw new Error(
    'CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION must be set.\n' +
    'Run: export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)\n' +
    '     export CDK_DEFAULT_REGION=ap-southeast-2'
  );
}

const env = {
  account: config.env.account,
  region: config.env.region,
};

const prefix = config.envPrefix;

// ── Stack 1: Landing Zone (VPC + Shared ALB) ──────────────────
const landingZone = new LandingZoneStack(app, `${prefix}-LandingZoneStack`, {
  env,
  description: `[${prefix}] Landing Zone - VPC, subnets, NAT GW, shared ALB`,
  terminationProtection: prefix === 'production',
});

// ── Stack 2: Shared ECS Cluster ───────────────────────────────
// One cluster per environment — all services in that env share it
const clusterStack = new EcsClusterStack(app, `${prefix}-EcsClusterStack`, {
  env,
  description: `[${prefix}] Shared ECS Cluster`,
  vpc: landingZone.vpcConstruct.vpc,
});

// ── Stack 3+: One stack per ECS service ───────────────────────
// Adding a new service = adding an entry to config.ecsApps
// Each gets its own stack: e.g. production-NginxAppStack, production-HttpdAppStack
for (const appConfig of config.ecsApps) {
  new EcsServiceStack(app, `${prefix}-${appConfig.id}Stack`, {
    env,
    description: `[${prefix}] ECS Service - ${appConfig.serviceName}`,
    vpc: landingZone.vpcConstruct.vpc,
    cluster: clusterStack.cluster,
    httpsListener: landingZone.albConstruct.httpsListener,
    albSecurityGroup: landingZone.albConstruct.albSecurityGroup,
    hostedZone: landingZone.albConstruct.hostedZone,
    alb: landingZone.albConstruct.alb,
    appConfig,
  });
}

app.synth();