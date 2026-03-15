# CDK Nginx Platform

Modular, config-driven CDK infrastructure. One shared ALB and ECS cluster for all apps.
Add a new ECS service by adding a single entry to `shared/config.ts` — no other files change.

## Project Structure

```
cdk-nginx-platform/
├── bin/
│   └── app.ts                                  # Single entrypoint for both stacks
│
├── shared/
│   └── config.ts                               # ← ADD NEW APPS HERE
│
├── landing-zone/
│   ├── constructs/
│   │   ├── vpc-construct.ts                    # VPC, subnets, NAT GW, flow logs
│   │   └── alb-construct.ts                    # Shared ALB, wildcard cert, Route53
│   └── stacks/
│       └── landing-zone-stack.ts               # Assembles VPC + ALB constructs
│
├── ecs-apps/
│   ├── constructs/
│   │   └── ecs-service-construct.ts            # Reusable Fargate service construct
│   └── stacks/
│       └── ecs-apps-stack.ts                   # Loops config → creates all services
│
├── .github/
│   └── workflows/
│       └── deploy.yml                          # GitHub Actions CI/CD
│
├── github-oidc-role.yml                        # One-time OIDC role setup
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
      │  nginx-app   │  │   api-app    │  ... more apps from config
      │   Fargate    │  │   Fargate    │
      │ private nets │  │ private nets │
      └──────────────┘  └──────────────┘
              │
          NAT GW → Internet (image pulls, AWS APIs)
```

## Constructs vs Stacks

```
Stacks (deployable units)         Constructs (reusable building blocks)
─────────────────────────         ──────────────────────────────────────
LandingZoneStack                  VpcConstruct
  └── uses VpcConstruct             └── VPC, 2 public + 2 private subnets
  └── uses AlbConstruct             └── NAT Gateway, Flow Logs

EcsAppsStack                      AlbConstruct
  └── uses EcsServiceConstruct      └── Public ALB, wildcard cert
        (once per app in config)    └── HTTPS listener, HTTP redirect

                                  EcsServiceConstruct (reused per app)
                                    └── Fargate service, task def
                                    └── Target group, listener rule
                                    └── Route53 record, auto scaling
```

## Adding a New ECS App

Edit **only** `shared/config.ts`:

```ts
ecsApps: [
  {
    id: 'NginxApp',           // existing app
    ...
  },
  {
    id: 'ApiApp',             // ← new app
    serviceName: 'api-service',
    containerName: 'api',
    containerPort: 3000,
    image: 'my-ecr-repo/api:latest',
    cpu: 512,
    memoryLimitMiB: 1024,
    desiredCount: 2,
    hostHeader: 'api-app.in.cld',
    dnsRecordName: 'api-app',
    minCapacity: 2,
    maxCapacity: 20,
    listenerRulePriority: 200,  // must be unique
  },
]
```

Push to `main` — GitHub Actions handles the rest.

## One-Time Setup

### 1. Create GitHub OIDC IAM Role
```bash
aws cloudformation deploy \
  --template-file github-oidc-role.yml \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubOrg=YOUR_GITHUB_USERNAME \
    GitHubRepo=YOUR_REPO_NAME \
    AccountId=$(aws sts get-caller-identity --query Account --output text) \
    CreateOidcProvider=true \
    BranchName=main
```

### 2. Add GitHub Secrets
**Settings → Secrets and variables → Actions**

| Secret | Value |
|--------|-------|
| `AWS_ROLE_ARN` | ARN from step 1 |
| `CDK_DEFAULT_ACCOUNT` | Your AWS account ID |
| `CDK_DEFAULT_REGION` | `ap-southeast-2` |

### 3. Bootstrap CDK (once per account/region)
```bash
npx cdk bootstrap aws://ACCOUNT_ID/ap-southeast-2
```

## GitHub Actions Flow

| Event | What happens |
|-------|-------------|
| PR to `main` | Build + `cdk diff` posted as PR comment |
| Push to `main` | Bootstrap → Deploy LandingZone → Deploy ECS Apps |
| Manual trigger | Available via `workflow_dispatch` in Actions tab |

## Local Commands

```bash
npm install

npm run diff           # diff both stacks
npm run deploy         # deploy both stacks
npm run deploy:lz      # deploy landing zone only
npm run deploy:ecs     # deploy ECS apps only

npm run destroy:ecs    # destroy ECS first
npm run destroy:lz     # then destroy landing zone
```
