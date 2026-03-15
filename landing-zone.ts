#!/usr/bin/env node
// bin/landing-zone.ts
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LandingZoneStack } from '../landing-zone/lib/landing-zone-stack';
import { config } from '../shared/config';

const app = new cdk.App();

new LandingZoneStack(app, 'LandingZoneStack', {
  env: config.env,
  description: 'Landing Zone — VPC, Subnets, NAT Gateway, Route Tables',
  terminationProtection: true,
});

app.synth();
