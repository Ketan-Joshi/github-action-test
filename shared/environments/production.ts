// shared/environments/production.ts
import { EnvironmentConfig } from '../config.types';

export const productionConfig: EnvironmentConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-southeast-2',
  },

  // Unique prefix — applied to ALL resource names to avoid clashes
  envPrefix: 'production',

  vpc: {
    cidr: '10.1.0.0/16',       // different CIDR from dev to avoid overlap
    maxAzs: 2,
    natGateways: 2,             // 2 NAT GWs for HA in production
  },

  alb: {
    hostedZoneName: 'cifoinfotech.com',
    certificateDomainName: '*.cifoinfotech.com',
  },

  ecsApps: [
    {
      id: 'NginxApp',
      serviceName: 'prod-nginx-service',
      containerName: 'nginx',
      containerPort: 80,
      image: 'nginx:latest',
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 2,
      hostHeader: 'nginx.cifoinfotech.com',
      dnsRecordName: 'nginx',
      minCapacity: 2,
      maxCapacity: 10,
      listenerRulePriority: 200,
      healthCheckCommand: 'curl -f http://localhost:80/ || exit 1',  // curl available in nginx
    },
    {
      id: 'HttpdApp',
      serviceName: 'prod-httpd-service',
      containerName: 'httpd',
      containerPort: 80,
      image: 'httpd:latest',
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 2,
      hostHeader: 'httpd.cifoinfotech.com',
      dnsRecordName: 'httpd',
      minCapacity: 2,
      maxCapacity: 10,
      listenerRulePriority: 100,
      // healthCheckCommand not set — httpd has no curl/wget, container health check skipped
    },
  ],

  tags: {
    Project: 'nginx-platform',
    ManagedBy: 'CDK',
    Environment: 'production',
    DeployedBy: 'GitHub-Actions',
  },
};