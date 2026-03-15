# CDK Nginx Platform

Modular, config-driven CDK infrastructure. One shared ALB and ECS cluster per environment.
Multiple environments (`development`, `production`) coexist in the **same AWS account** using resource prefixing.
Add a new ECS service by adding a single entry to the relevant environment config — no other files change.

---

## Project Structure

```
cdk-nginx-platform/
│
├── .github/
│   └── workflows/
│       └── deploy.yml                          # CI/CD — branch to environment mapping
│
├── bin/
│   └── app.ts                                  # Single entrypoint — creates all stacks
│
├── shared/
│   ├── config.ts                               # Environment loader — picks config based on APP_ENV
│   ├── config.types.ts                         # Shared interfaces (EnvironmentConfig, EcsAppConfig)
│   └── environments/
│       ├── development.ts                      # Dev settings (low cost, dev DNS, 1 task)
│       └── production.ts                       # Prod settings (HA, prod DNS, 2+ tasks)
│
├── landing-zone/
│   ├── constructs/
│   │   ├── vpc-construct.ts                    # VPC, 2 public + 2 private subnets, NAT GW, Flow Logs
│   │   └── alb-construct.ts                    # Shared ALB, wildcard cert, Route53, HTTPS listener
│   └── stacks/
│       └── landing-zone-stack.ts               # Assembles VPC + ALB constructs
│
├── ecs-apps/
│   ├── constructs/
│   │   └── ecs-service-construct.ts            # Reusable Fargate service building block
│   └── stacks/
│       ├── ecs-cluster-stack.ts                # One shared ECS cluster per environment
│       └── ecs-service-stack.ts                # One stack per ECS service (independent lifecycle)
│
├── github-oidc-role.yml                        # One-time CloudFormation setup for GitHub OIDC auth
├── cdk.json                                    # CDK app config and feature flags
├── package.json                                # Scripts and dependencies
├── tsconfig.json                               # TypeScript config
└── README.md
```

---

## Architecture

```
                         Internet
                            |
               +------------v------------+
               |       Route53 DNS       |
               |  dev-nginx.cifoinfotech.com   |
               |  nginx.cifoinfotech.com       |
               +------------+------------+
                            |
               +------------v------------+
               |       Shared ALB        |  Per environment
               |  Wildcard cert          |  Public subnets
               |  HTTP -> HTTPS redirect |
               +------------+------------+
                            | host-based routing
               +------------+------------+
               |                         |
       +--------v-----+         +--------v-----+
       |  nginx-app   |   ...   |  httpd-app   |  Add more via config
       |   Fargate    |         |   Fargate    |
       | private nets |         | private nets |
       +--------------+         +--------------+
               |
           NAT GW -> Internet (image pulls, AWS APIs)
```

---

## Stack Layout

Each environment gets its own fully isolated set of stacks:

```
Same AWS Account
|
+-- development-LandingZoneStack        # VPC (10.0.0.0/16) + Shared ALB
+-- development-EcsClusterStack         # development-shared-ecs-cluster
+-- development-NginxAppStack           # dev-nginx-service (1 task)
|
+-- production-LandingZoneStack         # VPC (10.1.0.0/16) + Shared ALB
+-- production-EcsClusterStack          # production-shared-ecs-cluster
+-- production-NginxAppStack            # prod-nginx-service (2 tasks)
+-- production-HttpdAppStack            # prod-httpd-service (2 tasks)
```

### What prevents clashes between environments

| Resource         | Development                    | Production                   |
|------------------|--------------------------------|------------------------------|
| Stack names      | `development-*`                | `production-*`               |
| VPC CIDR         | `10.0.0.0/16`                  | `10.1.0.0/16`                |
| ECS cluster      | `development-shared-ecs-cluster` | `production-shared-ecs-cluster` |
| ECS service      | `dev-nginx-service`            | `prod-nginx-service`         |
| DNS              | `dev-nginx.cifoinfotech.com`   | `nginx.cifoinfotech.com`     |
| Listener priority | `100`                         | `200`                        |

---

## Constructs vs Stacks

```
Stacks (deployable units)                Constructs (reusable building blocks)
--------------------------               -------------------------------------
development-LandingZoneStack             VpcConstruct
production-LandingZoneStack                -> VPC, subnets, NAT GW, Flow Logs

development-EcsClusterStack              AlbConstruct
production-EcsClusterStack                 -> ALB, wildcard cert, Route53

development-NginxAppStack                EcsServiceConstruct (reused per app)
production-NginxAppStack                   -> Fargate service, task definition
production-HttpdAppStack                   -> Target group, listener rule
                                           -> Route53 record, auto scaling
```

---

## Adding a New ECS Service

Edit only the relevant environment file in `shared/environments/`:

```ts
// shared/environments/production.ts
ecsApps: [
  {
    id: 'NginxApp',         // existing
    ...
  },
  {
    id: 'ApiApp',           // <- new service
    serviceName: 'prod-api-service',
    containerName: 'api',
    containerPort: 3000,
    image: 'my-ecr-repo/api:latest',
    cpu: 512,
    memoryLimitMiB: 1024,
    desiredCount: 2,
    hostHeader: 'api.cifoinfotech.com',
    dnsRecordName: 'api',
    minCapacity: 2,
    maxCapacity: 10,
    listenerRulePriority: 300,  // must be unique across all apps in that env
  },
],
```

Push to the relevant branch — a new `production-ApiAppStack` is created automatically
without touching any existing stacks.

---

## GitHub Actions Flow

### Branch to environment mapping

```
push to develop  ->  APP_ENV=development  ->  deploys development-* stacks
push to main     ->  APP_ENV=production   ->  deploys production-* stacks  (PR only)
PR to either     ->  runs cdk diff and posts comment
manual trigger   ->  choose dev or prod from dropdown
```

### Pipeline jobs and order

```
build
  -> TypeScript compile check

resolve-env
  -> Determines development or production based on branch

diff  (PR only)
  -> cdk diff --all -> posts result as PR comment

deploy-landing-zone
  -> cdk bootstrap (idempotent)
  -> cdk deploy {env}-LandingZoneStack

deploy-ecs-cluster  (depends on landing-zone)
  -> cdk deploy {env}-EcsClusterStack

deploy-ecs-services  (depends on ecs-cluster)
  -> cdk deploy "{env}-*AppStack"
  -> deploys ALL service stacks in parallel
  -> new services are picked up automatically
```

---

## One-Time Setup

### 1. Create GitHub OIDC IAM Role
```bash
aws cloudformation deploy \
  --template-file github-oidc-role.yml \
  --stack-name github-actions-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubOrg=Ketan-Joshi \
    GitHubRepo=github-action-test \
    AccountId=$(aws sts get-caller-identity --query Account --output text) \
    CreateOidcProvider=true \
    BranchName=main
```

### 2. Add GitHub Secrets
**Settings -> Secrets and variables -> Actions -> New repository secret**

| Secret                | Value                                      |
|-----------------------|--------------------------------------------|
| `AWS_ROLE_ARN`        | ARN from step 1                            |
| `CDK_DEFAULT_ACCOUNT` | Your AWS account ID                        |
| `CDK_DEFAULT_REGION`  | `ap-southeast-2`                           |
| `HOSTED_ZONE_NAME`    | `cifoinfotech.com`                         |

### 3. Add GitHub Environments
**Settings -> Environments** - create two environments:

| Environment   | Triggered by     |
|---------------|------------------|
| `development` | `develop` branch |
| `production`  | `main` branch    |

Both use the same secrets since it is one AWS account.
You can add **approval gates** to `production` for extra safety.

### 4. Branch Protection for main
**Settings -> Branches -> Add branch ruleset**
- Require pull request before merging
- Require 1 approval
- Require status checks: `Build & Lint`
- Block force pushes

### 5. Bootstrap CDK (once per account/region)
```bash
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=ap-southeast-2
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

---

## Local Commands

```bash
npm install

# Deploy dev environment
APP_ENV=development npm run deploy

# Deploy prod environment
APP_ENV=production npm run deploy

# Deploy only landing zone
APP_ENV=development npm run deploy:lz

# Deploy only ECS cluster
APP_ENV=development npx cdk deploy development-EcsClusterStack

# Deploy a specific service
APP_ENV=production npx cdk deploy production-NginxAppStack

# Destroy (always in reverse order)
APP_ENV=production npx cdk destroy production-HttpdAppStack
APP_ENV=production npx cdk destroy production-NginxAppStack
APP_ENV=production npx cdk destroy production-EcsClusterStack
APP_ENV=production npm run destroy:lz
```