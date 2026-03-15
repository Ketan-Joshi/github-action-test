// ecs-apps/stacks/ecs-service-stack.ts
// One stack per ECS service — independent lifecycle, deploy, and destroy
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { EcsServiceConstruct } from '../constructs/ecs-service-construct';
import { EcsAppConfig, config } from '../../shared/config';

export interface EcsServiceStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  cluster: ecs.Cluster;
  httpsListener: elbv2.IApplicationListener;
  albSecurityGroup: ec2.ISecurityGroup;
  hostedZone: route53.IHostedZone;
  alb: elbv2.IApplicationLoadBalancer;
  appConfig: EcsAppConfig;
}

export class EcsServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsServiceStackProps) {
    super(scope, id, props);

    Object.entries(config.tags).forEach(([k, v]: [string, string]) => cdk.Tags.of(this).add(k, v));

    new EcsServiceConstruct(this, props.appConfig.id, {
      vpc: props.vpc,
      cluster: props.cluster,
      httpsListener: props.httpsListener,
      albSecurityGroup: props.albSecurityGroup,
      hostedZone: props.hostedZone,
      alb: props.alb,
      appConfig: props.appConfig,
    });
  }
}