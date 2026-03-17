# CDK Nginx Platform

Modular, config-driven CDK infrastructure. One shared ALB and ECS cluster per environment.
Multiple environments (`development`, `production`) coexist in the **same AWS account** using resource prefixing.
Image tags are resolved automatically from the `deployment-trigger` repo, with optional manual override.

---

## Project Structure

```
cdk-nginx-platform/
│
├── .github/
│   └── workflows/
│       ├── deploy.yml                          # Main deployment pipeline
│       └── pr-checks.yaml                      # PR validation checks
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
       |  NginxApp    |   ...   |  HttpdApp    |  Add more via config
       |   Fargate    |         |   Fargate    |
       | private nets |         | private nets |
       +--------------+         +--------------+
               |
           NAT GW -> Internet (image pulls, AWS APIs)
```

---

## Stack Layout

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

| Resource          | Development                      | Production                       |
|-------------------|----------------------------------|----------------------------------|
| Stack names       | `development-*`                  | `production-*`                   |
| VPC CIDR          | `10.0.0.0/16`                    | `10.1.0.0/16`                    |
| ECS cluster       | `development-shared-ecs-cluster` | `production-shared-ecs-cluster`  |
| ECS service       | `dev-nginx-service`              | `prod-nginx-service`             |
| DNS               | `dev-nginx.cifoinfotech.com`     | `nginx.cifoinfotech.com`         |
| Listener priority | `100`                            | `200`                            |

---

## Image Tag Resolution (GitOps)

Images are always pulled from ECR. The tag is resolved in this priority order:

```
1. Manual input (workflow_dispatch image_tag field)   <- takes priority
        |
        v (if empty)
2. RELEASE file in deployment-trigger repo
   branch = appConfig.id (e.g. NginxApp, HttpdApp)
   file   = RELEASE
        |
        v
3. Construct full ECR image URI:
   {account}.dkr.ecr.{region}.amazonaws.com/{appId_lowercase}:{tag}
   e.g. 682363910843.dkr.ecr.ap-southeast-2.amazonaws.com/nginxapp:v1.2.3
```

### deployment-trigger repo structure

```
deployment-trigger/
├── (branch: NginxApp)   ->  RELEASE   contains: v1.2.3
└── (branch: HttpdApp)   ->  RELEASE   contains: v2.0.1
```

### ECR repo naming convention

| appConfig.id | ECR repo name  |
|---|---|
| `NginxApp`  | `nginxapp`  |
| `HttpdApp`  | `httpdapp`  |
| `ApiApp`    | `apiapp`    |

---

## GitHub Actions Flow

### Trigger modes

| Trigger | What happens |
|---|---|
| Push to `develop` | Deploys ALL services to development, tags auto-fetched from deployment-trigger repo |
| PR to `main` or `develop` | Runs `cdk diff` and posts result as PR comment |
| `workflow_dispatch` | Deploys ONE specific service to chosen environment with optional manual tag |

### Manual trigger UI (Actions tab -> Run workflow)

```
Environment:  [development | production]
Service ID:   NginxApp                   <- must match id in ecsApps config
Image tag:    ___________                <- leave empty to auto-fetch from RELEASE
```

### Pipeline job order

```
build
  -> TypeScript compile check

resolve-env
  -> Determines development or production

resolve-image  (workflow_dispatch only)
  -> Fetches tag from deployment-trigger repo if image_tag not provided
  -> Builds full ECR image URI

diff  (PR only)
  -> cdk diff --all -> posts result as PR comment

deploy-landing-zone
  -> cdk bootstrap (idempotent)
  -> cdk deploy {env}-LandingZoneStack

deploy-ecs-cluster  (depends on landing-zone)
  -> cdk deploy {env}-EcsClusterStack

deploy-ecs-services  (push to develop only)
  -> Fetches RELEASE for ALL services from deployment-trigger repo
  -> Authenticates with ECR
  -> cdk deploy "{env}-*AppStack" with all image overrides

deploy-single-service  (workflow_dispatch only)
  -> Authenticates with ECR
  -> cdk deploy {env}-{ServiceId}Stack with resolved image
  -> Posts deployment summary
```

---

## Adding a New ECS Service

### Step 1 — Add to environment config

Edit `shared/environments/production.ts` (and/or `development.ts`):

```ts
ecsApps: [
  {
    id: 'NginxApp',      // existing
    ...
  },
  {
    id: 'ApiApp',        // <- new service
    serviceName: 'prod-api-service',
    containerName: 'api',
    containerPort: 3000,
    image: 'nginx:latest',          // fallback only — real deploys use ECR
    cpu: 512,
    memoryLimitMiB: 1024,
    desiredCount: 2,
    hostHeader: 'api.cifoinfotech.com',
    dnsRecordName: 'api',
    minCapacity: 2,
    maxCapacity: 10,
    listenerRulePriority: 300,      // must be unique
    healthCheckCommand: 'curl -f http://localhost:3000/health || exit 1',
  },
],
```

### Step 2 — Create ECR repo

```bash
aws ecr create-repository \
  --repository-name apiapp \
  --region ap-southeast-2 \
  --profile ketan
```

### Step 3 — Create branch in deployment-trigger repo

```bash
# In deployment-trigger repo
git checkout -b ApiApp
echo "v1.0.0" > RELEASE
git add RELEASE
git commit -m "init: ApiApp release"
git push origin ApiApp
```

### Step 4 — Push CDK changes

```bash
git add .
git commit -m "feat: add ApiApp service"
git push origin develop
```

A new `development-ApiAppStack` is created automatically. No other files need changing.

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

| Secret | Value |
|---|---|
| `AWS_ROLE_ARN` | ARN from step 1 |
| `CDK_DEFAULT_ACCOUNT` | Your AWS account ID e.g. `682363910843` |
| `CDK_DEFAULT_REGION` | `ap-southeast-2` |
| `HOSTED_ZONE_NAME` | `cifoinfotech.com` |
| `DEPLOYMENT_TRIGGER_REPO` | `Ketan-Joshi/deployment-trigger` |
| `DEPLOYMENT_TRIGGER_TOKEN` | Fine-grained PAT: `deployment-trigger` repo, `Contents: Read-only` |

### 3. Add GitHub Environments
**Settings -> Environments** — create two environments:

| Environment | Triggered by | Protection |
|---|---|---|
| `development` | `develop` branch push | None |
| `production` | `main` branch (PR merge) | Add required reviewers |

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

# Deploy all stacks for dev
APP_ENV=development npm run deploy

# Deploy all stacks for prod
APP_ENV=production npm run deploy

# Deploy only landing zone
APP_ENV=development npm run deploy:lz

# Deploy a specific service with ECR image override
APP_ENV=production npx cdk deploy production-NginxAppStack \
  --context "hosted-zone-id=ZXXXXX" \
  --context "hosted-zone-name=cifoinfotech.com" \
  --context "image-override-NginxApp=682363910843.dkr.ecr.ap-southeast-2.amazonaws.com/nginxapp:v1.2.3"

# Destroy (always in reverse order)
APP_ENV=production npx cdk destroy production-HttpdAppStack
APP_ENV=production npx cdk destroy production-NginxAppStack
APP_ENV=production npx cdk destroy production-EcsClusterStack
APP_ENV=production npm run destroy:lz
```

---

## Security Practices

- ECS tasks run in **private subnets** — not directly reachable from internet
- ECS SG only allows inbound from **ALB SG**
- ALB enforces **HTTPS only** (HTTP -> 301 redirect)
- **TLS 1.2+** (`RECOMMENDED_TLS` policy)
- **Wildcard ACM cert** — no new cert needed per service
- `dropInvalidHeaderFields: true` on ALB
- **VPC Flow Logs** enabled
- Task execution role allows **ECR pull only** (least privilege)
- Task role has **SSM messages** only (for ECS Exec)
- GitHub Actions uses **OIDC** (no long-lived AWS access keys)
- `DEPLOYMENT_TRIGGER_TOKEN` is a **fine-grained PAT** scoped to one repo + `Contents: Read` only
- Circuit breaker with **automatic rollback** on failed deployments