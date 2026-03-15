# CDK Nginx App

Modular CDK infrastructure for running Nginx on ECS Fargate with a public ALB and Route53 DNS.

## Project Structure

```
cdk-nginx-app/
├── bin/
│   ├── landing-zone.ts       # Entrypoint for VPC stack
│   └── ecs-app.ts            # Entrypoint for ECS stack
├── landing-zone/
│   └── lib/
│       ├── landing-zone-stack.ts
│       └── vpc-construct.ts  # VPC, subnets, NAT GW, route tables
├── ecs-app/
│   └── lib/
│       ├── ecs-app-stack.ts
│       ├── alb-construct.ts  # Public ALB, ACM cert, Route53 record (shared)
│       └── ecs-construct.ts  # ECS cluster, Fargate service, auto scaling
├── shared/
│   └── config.ts             # Central config shared across all stacks
├── cdk.json
├── package.json
└── tsconfig.json
```

## Architecture

```
Internet
   │
   ▼
Route53 (nginx-app.in.cld)
   │
   ▼
Public ALB (port 443, TLS 1.2+)
   │  HTTP→HTTPS redirect on port 80
   ▼
ECS Fargate (private subnets, 2 AZs)
   │  Only reachable from ALB SG
   ▼
Nginx containers (port 80)
   │
   ▼
NAT Gateway → Internet (for image pulls, AWS API calls)
```

## Security Practices

- ECS tasks run in **private subnets** — not directly reachable from internet
- ECS security group only allows inbound from **ALB security group**
- ALB enforces **HTTPS only** (HTTP → 301 redirect)
- ALB uses **TLS 1.2+** (RECOMMENDED_TLS policy)
- ALB has `dropInvalidHeaderFields: true`
- Task execution role follows **least privilege**
- Task role only has **SSM messages** permissions (for ECS Exec)
- **VPC Flow Logs** enabled for traffic auditing
- Default security group **restricted**
- Auto scaling between **2–10 tasks** across 2 AZs
- Circuit breaker with **automatic rollback** on failed deployments

## Prerequisites

```bash
npm install -g aws-cdk
npm install
npx cdk bootstrap aws://ACCOUNT_ID/ap-southeast-2
```

Ensure your hosted zone `in.cld` exists in Route53 before deploying.

## Deployment

### Step 1 — Deploy Landing Zone (VPC)
```bash
npm run deploy:landing-zone
# or
cdk deploy LandingZoneStack --app 'npx ts-node bin/landing-zone.ts'
```

### Step 2 — Deploy ECS App (ALB + Fargate)
```bash
npm run deploy:ecs-app
# or
cdk deploy EcsAppStack --app 'npx ts-node bin/ecs-app.ts'
```

### Destroy (in reverse order)
```bash
cdk destroy EcsAppStack --app 'npx ts-node bin/ecs-app.ts'
cdk destroy LandingZoneStack --app 'npx ts-node bin/landing-zone.ts'
```

## Configuration

All tuneable values live in `shared/config.ts`:

| Key | Default | Description |
|-----|---------|-------------|
| `vpc.cidr` | `10.0.0.0/16` | VPC CIDR block |
| `vpc.maxAzs` | `2` | Number of AZs (2 public + 2 private subnets) |
| `vpc.natGateways` | `1` | NAT gateways (increase for HA) |
| `ecs.cpu` | `256` | Fargate task CPU units |
| `ecs.memoryLimitMiB` | `512` | Fargate task memory |
| `ecs.desiredCount` | `2` | Initial task count |
| `ecs.image` | `nginx:latest` | Container image |
| `dns.fqdn` | `nginx-app.in.cld` | Full DNS name |
