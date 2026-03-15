// shared/config.ts
// Central configuration shared across all stacks

export const config = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },

  // Landing Zone
  vpc: {
    cidr: '10.0.0.0/16',
    maxAzs: 2,
    natGateways: 1,
  },

  // ECS
  ecs: {
    clusterName: 'nginx-cluster',
    serviceName: 'nginx-service',
    containerName: 'nginx',
    containerPort: 80,
    cpu: 256,
    memoryLimitMiB: 512,
    desiredCount: 2,
    image: 'nginx:latest',
  },

  // ALB + Route53
  dns: {
    hostedZoneName: 'in.cld',
    recordName: 'nginx-app',
    fqdn: 'nginx.sample.in.cld',
  },

  // Tags
  tags: {
    Project: 'nginx-app',
    ManagedBy: 'CDK',
    Environment: 'production',
  },
};
