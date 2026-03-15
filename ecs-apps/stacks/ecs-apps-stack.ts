// ecs-apps/stacks/ecs-apps-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { EcsServiceConstruct } from '../constructs/ecs-service-construct';
import { config } from '../../shared/config.types';

export interface EcsAppsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  httpsListener: elbv2.IApplicationListener;
  albSecurityGroup: ec2.ISecurityGroup;
  hostedZone: route53.IHostedZone;
  alb: elbv2.IApplicationLoadBalancer;
}

export class EcsAppsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsAppsStackProps) {
    super(scope, id, props);

    Object.entries(config.tags).forEach(([k, v]) => cdk.Tags.of(this).add(k, v));

    // Shared ECS Cluster — all apps share one cluster
    const cluster = new ecs.Cluster(this, 'SharedCluster', {
      clusterName: 'shared-ecs-cluster',
      vpc: props.vpc,
      containerInsights: true,
      enableFargateCapacityProviders: true,
    });

    // Auto-create a Fargate service for every app in config.ecsApps
    // To add a new service: just add an entry to shared/config.ts
    for (const appConfig of config.ecsApps) {
      new EcsServiceConstruct(this, appConfig.id, {
        vpc: props.vpc,
        cluster,
        httpsListener: props.httpsListener,
        albSecurityGroup: props.albSecurityGroup,
        hostedZone: props.hostedZone,
        alb: props.alb,
        appConfig,
      });
    }
  }
}
