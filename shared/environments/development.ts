// shared/environments/development.ts
import { EnvironmentConfig } from '../config.types';

export const developmentConfig: EnvironmentConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },

  // Unique prefix — applied to ALL resource names to avoid clashes
  envPrefix: 'development',

  vpc: {
    cidr: '10.0.0.0/16',      // dev VPC CIDR
    maxAzs: 2,
    natGateways: 1,            // cost saving in dev
  },

  alb: {
    hostedZoneName: 'sample.in.cld',
    certificateDomainName: '*.sample.in.cld',
  },

  ecsApps: [
    {
      id: 'NginxApp',
      serviceName: 'dev-nginx-service',         // prefixed
      containerName: 'nginx',
      containerPort: 80,
      image: 'nginx:latest',
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      hostHeader: 'dev-nginx.sample.in.cld',       // prefixed subdomain
      dnsRecordName: 'dev-nginx',
      minCapacity: 1,
      maxCapacity: 3,
      listenerRulePriority: 100,
    },
  ],

  tags: {
    Project: 'nginx-platform',
    ManagedBy: 'CDK',
    Environment: 'development',
    DeployedBy: 'GitHub-Actions',
  },
};