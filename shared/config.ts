// shared/config.ts
// ============================================================
// CENTRAL CONFIGURATION
// To add a new ECS app, just add an entry to `ecsApps` below.
// Everything else (listener rules, target groups, DNS) is auto-wired.
// ============================================================

export interface EcsAppConfig {
  id: string;           // Unique ID used for CDK construct IDs
  serviceName: string;  // ECS service name
  containerName: string;
  containerPort: number;
  image: string;        // Docker image
  cpu: number;
  memoryLimitMiB: number;
  desiredCount: number;
  // ALB routing — path-based or host-based
  pathPattern?: string; // e.g. '/api/*'  (uses path-based routing if set)
  hostHeader?: string;  // e.g. 'nginx-app.in.cld' (uses host-based if set)
  // Route53
  dnsRecordName: string; // e.g. 'nginx-app' → nginx-app.in.cld
  // Auto scaling
  minCapacity: number;
  maxCapacity: number;
  // ALB listener rule priority (must be unique across all apps)
  listenerRulePriority: number;
}

export const config = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '682363910843',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },

  // ── Landing Zone ──────────────────────────────────────────
  vpc: {
    cidr: '10.0.0.0/16',
    maxAzs: 2,
    natGateways: 1,
  },

  // ── Shared ALB ────────────────────────────────────────────
  alb: {
    hostedZoneName: 'sample.in.cld',  // Your Route53 hosted zone
    // Wildcard cert covers all subdomains e.g. *.in.cld
    certificateDomainName: '*.sample.in.cld',
  },

  // ── ECS Apps ──────────────────────────────────────────────
  // ADD NEW APPS HERE — everything else is auto-wired
  ecsApps: [
    {
      id: 'NginxApp',
      serviceName: 'nginx-service',
      containerName: 'nginx',
      containerPort: 80,
      image: 'nginx:latest',
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 2,
      hostHeader: 'nginx.sample.in.cld',
      dnsRecordName: 'nginx',
      minCapacity: 2,
      maxCapacity: 10,
      listenerRulePriority: 100,
    },
    // ── Example: adding a second app ──────────────────────
    // {
    //   id: 'ApiApp',
    //   serviceName: 'api-service',
    //   containerName: 'api',
    //   containerPort: 3000,
    //   image: 'my-api:latest',
    //   cpu: 512,
    //   memoryLimitMiB: 1024,
    //   desiredCount: 2,
    //   hostHeader: 'api-app.in.cld',
    //   dnsRecordName: 'api-app',
    //   minCapacity: 2,
    //   maxCapacity: 20,
    //   listenerRulePriority: 200,
    // },
  ] as EcsAppConfig[],

  // ── Tags ──────────────────────────────────────────────────
  tags: {
    Project: 'nginx-platform',
    ManagedBy: 'CDK',
    Environment: 'production',
    DeployedBy: 'GitHub-Actions',
  },
};
