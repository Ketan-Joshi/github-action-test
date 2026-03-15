// ecs-apps/stacks/ecs-cluster-stack.ts
// Shared ECS Cluster — deployed once per environment, referenced by all EcsServiceStacks
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { config } from '../../shared/config';

export interface EcsClusterStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class EcsClusterStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: EcsClusterStackProps) {
    super(scope, id, props);

    Object.entries(config.tags).forEach(([k, v]: [string, string]) => cdk.Tags.of(this).add(k, v));

    this.cluster = new ecs.Cluster(this, 'SharedCluster', {
      clusterName: `${config.envPrefix}-shared-ecs-cluster`,
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      enableFargateCapacityProviders: true,
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: `${config.envPrefix}-ClusterName`,
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      exportName: `${config.envPrefix}-ClusterArn`,
    });
  }
}