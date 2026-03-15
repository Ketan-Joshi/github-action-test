# CDK Nginx Platform

Modular, config-driven CDK infrastructure. One shared ALB and ECS cluster for all apps.
Add a new ECS service by adding a single entry to `shared/config.ts` — no other files change.

## Project Structure

```
cdk-nginx-platform/
├── bin/
│   └── app.ts                        # Single entrypoint for both stacks
├── shared/
│   └── config.ts                     # ← ADD NEW APPS HERE
├── landing-zone/
│   └── lib/
│       ├── landing-zone-stack.ts     # VPC + shared ALB in one stack
│       ├── vpc-construct.ts          # VPC, 2 public + 2 private subnets, NAT GW
│       └── alb-construct.ts          # Shared ALB, wildcard cert, Route53
├── ecs-apps/
│   └── lib/
│       ├── ecs-apps-stack.ts         # Loops over config.ecsApps, creates all services
│       └── ecs-service-construct.ts  # Generic reusable Fargate service construct
├── .github/
│   └── workflows/
│       └── deploy.yml                # GitHub Actions CI/CD pipeline
├── github-oidc-role.yml              # One-time CloudFormation setup for OIDC auth
├── cdk.json
├── package.json
└── tsconfig.json
```

## Architecture

```
                    Internet
                       │
              ┌────────▼────────┐
              │  Route53 DNS    │  nginx-app.in.cld, api-app.in.cld ...
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │   Shared ALB    │  Public subnets, wildcard cert *.in.cld
              │  (landing zone) │  HTTP → HTTPS redirect
              └────────┬────────┘
                       │ host-based routing
              ┌────────┴────────┐
              │                 │
      ┌───────▼──────┐  ┌───────▼──────┐
      │  nginx-app   │  │   api-app    │  ... more apps
      │   Fargate    │  │   Fargate    │
      │ private nets │  │ private nets │
      └──────────────┘  └──────────────┘
              │
          NAT GW → Internet (image pulls, AWS APIs)
```

## Adding a New ECS App

Edit **only** `shared/config.ts` — add a new entry to `ecsApps[]`:

```ts
{
  id: 'ApiApp',                      // Unique CDK construct ID
  serviceName: 'api-service',
  containerName: 'api',
  containerPort: 3000,
  image: 'my-ecr-repo/api:latest',
  cpu: 512,
  memoryLimitMiB: 1024,
  desiredCount: 2,
  hostHeader: 'api-app.in.cld',      // Host-based ALB routing
  dnsRecordName: 'api-app',          // → api-app.in.cld
  minCapacity: 2,
  maxCapacity: 20,
  listenerRulePriority: 200,         // Must be unique across all apps
},
```

Then push to `main` — GitHub Actions handles the rest.

## Security Practices

- ECS tasks in **private subnets** only
- Each ECS service SG only allows inbound from **ALB SG**
- Shared ALB enforces **HTTPS** (HTTP → 301 redirect)
- **TLS 1.2+** only (`RECOMMENDED_TLS` policy)
- **Wildcard ACM cert** — no new cert needed per app
- `dropInvalidHeaderFields: true` on ALB
- **VPC Flow Logs** enabled
- Task roles follow **least privilege**
- GitHub Actions uses **OIDC** (no long-lived AWS keys)
- Circuit breaker with **automatic rollback**

## One-Time Setup

### 1. Create GitHub OIDC IAM Role
```bash
aws cloudformation deploy \
  --template-file github-oidc-role.yml \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubOrg=YOUR_ORG \
    GitHubRepo=YOUR_REPO \
    BranchName=main
```

### 2. Add GitHub Secrets
Go to **Settings → Secrets → Actions** in your repo and add:

| Secret | Value |
|--------|-------|
| `AWS_ROLE_ARN` | Output from step 1 |
| `CDK_DEFAULT_ACCOUNT` | Your AWS account ID |
| `CDK_DEFAULT_REGION` | e.g. `ap-southeast-2` |

### 3. Bootstrap CDK (once per account/region)
```bash
npx cdk bootstrap aws://ACCOUNT_ID/ap-southeast-2
```

## GitHub Actions Flow

| Event | What happens |
|-------|-------------|
| PR to `main` | Build + `cdk diff` posted as PR comment |
| Push to `main` | Deploy `LandingZoneStack` → then `EcsAppsStack` |
| Manual trigger | Available via `workflow_dispatch` |

## Local Commands

```bash
npm install

npm run diff           # diff both stacks
npm run deploy         # deploy both stacks
npm run deploy:lz      # deploy landing zone only
npm run deploy:ecs     # deploy ECS apps only

npm run destroy:ecs    # destroy ECS apps first
npm run destroy:lz     # then destroy landing zone
```
