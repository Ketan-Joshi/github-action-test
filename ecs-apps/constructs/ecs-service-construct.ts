// ecs-apps/constructs/ecs-service-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { EcsAppConfig, config } from '../../shared/config';

export interface EcsServiceConstructProps {
  vpc: ec2.IVpc;
  cluster: ecs.Cluster;
  httpsListener: elbv2.IApplicationListener;
  albSecurityGroup: ec2.ISecurityGroup;
  hostedZone: route53.IHostedZone;
  alb: elbv2.IApplicationLoadBalancer;
  appConfig: EcsAppConfig;
}

export class EcsServiceConstruct extends Construct {
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsServiceConstructProps) {
    super(scope, id);

    const { vpc, cluster, httpsListener, albSecurityGroup, hostedZone, alb, appConfig } = props;

    // Per-service log group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/ecs/${appConfig.serviceName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Task Execution Role — used by ECS agent (pull images, write logs)
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Task Role — used by the container itself (least privilege)
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task role for ${appConfig.serviceName}`,
    });

    // ECS Exec for live debugging
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssmmessages:CreateControlChannel',
        'ssmmessages:CreateDataChannel',
        'ssmmessages:OpenControlChannel',
        'ssmmessages:OpenDataChannel',
      ],
      resources: ['*'],
    }));

    // Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: appConfig.cpu,
      memoryLimitMiB: appConfig.memoryLimitMiB,
      executionRole,
      taskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
    });

    // Container definition
    taskDefinition.addContainer('Container', {
      containerName: appConfig.containerName,
      image: ecs.ContainerImage.fromRegistry(appConfig.image),
      portMappings: [{ containerPort: appConfig.containerPort, protocol: ecs.Protocol.TCP }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: appConfig.containerName,
        logGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', `curl -f http://localhost:${appConfig.containerPort}/ || exit 1`],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      },
    });

    // ECS Security Group — ONLY allows traffic from the shared ALB
    const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      description: `${appConfig.serviceName} — allow inbound from shared ALB only`,
      allowAllOutbound: true,
    });

    ecsSg.addIngressRule(
      ec2.Peer.securityGroupId(albSecurityGroup.securityGroupId),
      ec2.Port.tcp(appConfig.containerPort),
      `Allow from shared ALB to ${appConfig.containerName}`
    );

    // Fargate Service — always in private subnets
    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: appConfig.serviceName,
      cluster,
      taskDefinition,
      desiredCount: appConfig.desiredCount,
      securityGroups: [ecsSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
      deploymentController: { type: ecs.DeploymentControllerType.ECS },
      enableExecuteCommand: true,
      capacityProviderStrategies: [{ capacityProvider: 'FARGATE', weight: 1 }],
    });

    // Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc,
      port: appConfig.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
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
    });

    // ALB Listener Rule — host-based or path-based routing
    if (appConfig.hostHeader) {
      new elbv2.ApplicationListenerRule(this, 'ListenerRule', {
        listener: httpsListener,
        priority: appConfig.listenerRulePriority,
        conditions: [elbv2.ListenerCondition.hostHeaders([appConfig.hostHeader])],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
    } else if (appConfig.pathPattern) {
      new elbv2.ApplicationListenerRule(this, 'ListenerRule', {
        listener: httpsListener,
        priority: appConfig.listenerRulePriority,
        conditions: [elbv2.ListenerCondition.pathPatterns([appConfig.pathPattern])],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
    }

    // Route53 A record → shared ALB
    new route53.ARecord(this, 'DnsRecord', {
      zone: hostedZone,
      recordName: appConfig.dnsRecordName,
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(alb)),
    });

    // Auto Scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: appConfig.minCapacity,
      maxCapacity: appConfig.maxCapacity,
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

    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: `https://${appConfig.dnsRecordName}.${config.alb.hostedZoneName}`,
      description: `URL for ${appConfig.serviceName}`,
    });
  }
}
