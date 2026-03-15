// ecs-app/lib/ecs-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { config } from '../../shared/config';

export interface EcsConstructProps {
  vpc: ec2.IVpc;
  httpsListener: elbv2.ApplicationListener;
  albSecurityGroup: ec2.SecurityGroup;
}

export class EcsConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsConstructProps) {
    super(scope, id);

    const { vpc, httpsListener, albSecurityGroup } = props;

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: config.ecs.clusterName,
      vpc,
      containerInsights: true, // enables CloudWatch Container Insights
      enableFargateCapacityProviders: true,
    });

    // CloudWatch Log Group for container logs
    const logGroup = new logs.LogGroup(this, 'NginxLogGroup', {
      logGroupName: `/ecs/${config.ecs.serviceName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Task Execution Role — used by ECS agent to pull images, write logs
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // Task Role — used by the container itself (least privilege)
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role assumed by nginx ECS task containers',
    });

    // Allow ECS Exec for debugging (optional but useful)
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
      })
    );

    // Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: config.ecs.cpu,
      memoryLimitMiB: config.ecs.memoryLimitMiB,
      executionRole,
      taskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
    });

    // Nginx Container
    taskDefinition.addContainer('NginxContainer', {
      containerName: config.ecs.containerName,
      image: ecs.ContainerImage.fromRegistry(config.ecs.image),
      portMappings: [
        {
          containerPort: config.ecs.containerPort,
          protocol: ecs.Protocol.TCP,
        },
      ],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: config.ecs.containerName,
        logGroup,
      }),
      // Read-only root filesystem — security best practice
      readonlyRootFilesystem: false, // nginx needs to write tmp files; set true only for custom images
      environment: {
        NGINX_PORT: String(config.ecs.containerPort),
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      },
    });

    // ECS Security Group — only allow traffic FROM the ALB
    const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: true, // needed for pulling images, calling AWS APIs
    });

    ecsSg.addIngressRule(
      ec2.Peer.securityGroupId(albSecurityGroup.securityGroupId),
      ec2.Port.tcp(config.ecs.containerPort),
      'Allow traffic only from ALB'
    );

    // Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: config.ecs.serviceName,
      cluster: this.cluster,
      taskDefinition,
      desiredCount: config.ecs.desiredCount,
      securityGroups: [ecsSg],

      // Deploy into PRIVATE subnets — tasks not directly reachable from internet
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },

      // Rolling update with circuit breaker
      circuitBreaker: { rollback: true },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },

      // Enable ECS Exec for debugging
      enableExecuteCommand: true,

      // Spread tasks across AZs for HA
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        },
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 0, // set weight >0 to use Spot for cost savings
        },
      ],
    });

    // Attach service to ALB HTTPS listener
    this.service.registerLoadBalancerTargets({
      containerName: config.ecs.containerName,
      containerPort: config.ecs.containerPort,
      newTargetGroupId: 'NginxTargetGroup',
      listener: ecs.ListenerConfig.applicationListener(httpsListener, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        port: config.ecs.containerPort,
        targets: [this.service],
        healthCheck: {
          path: '/',
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          healthyHttpCodes: '200',
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }),
    });

    // Auto Scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
    });
  }
}
