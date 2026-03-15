// shared/environments/development.ts
import { EnvironmentConfig } from '../config.types';

export const developmentConfig: EnvironmentConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-2',
  },

  // Unique prefix — applied to ALL resource names to avoid clashes
  envPrefix: 'dev',

  vpc: {
    cidr: '10.0.0.0/16',      // dev VPC CIDR
    maxAzs: 2,
    natGateways: 1,            // cost saving in dev
  },

  alb: {
    hostedZoneName: 'in.cld',
    certificateDomainName: '*.in.cld',
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
      hostHeader: 'dev-nginx-app.in.cld',       // prefixed subdomain
      dnsRecordName: 'dev-nginx-app',
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