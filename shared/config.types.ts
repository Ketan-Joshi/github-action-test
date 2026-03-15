// shared/config.types.ts
// All interfaces and types shared across environment configs

export interface EcsAppConfig {
  id: string;
  serviceName: string;
  containerName: string;
  containerPort: number;
  image: string;
  cpu: number;
  memoryLimitMiB: number;
  desiredCount: number;
  pathPattern?: string;
  hostHeader?: string;
  dnsRecordName: string;
  minCapacity: number;
  maxCapacity: number;
  listenerRulePriority: number;
  healthCheckCommand?: string;  // optional — if not provided, container health check is skipped
}

export interface EnvironmentConfig {
  env: {
    account: string | undefined;
    region: string;
  };
  // Prefix applied to all stack and resource names — prevents clashes
  // when deploying multiple environments to the same AWS account
  envPrefix: string;
  vpc: {
    cidr: string;
    maxAzs: number;
    natGateways: number;
  };
  alb: {
    hostedZoneName: string;
    certificateDomainName: string;
  };
  ecsApps: EcsAppConfig[];
  tags: Record<string, string>;
}