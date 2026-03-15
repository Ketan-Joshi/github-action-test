// ecs-app/lib/ecs-app-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { AlbConstruct } from './alb-construct';
import { EcsConstruct } from './ecs-construct';
import { config } from '../../shared/config';

export interface EcsAppStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class EcsAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsAppStackProps) {
    super(scope, id, props);

    // Apply tags to all resources in this stack
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    // ALB (shared — can be reused for multiple services)
    const alb = new AlbConstruct(this, 'AlbConstruct', {
      vpc: props.vpc,
    });

    // ECS Fargate service
    new EcsConstruct(this, 'EcsConstruct', {
      vpc: props.vpc,
      httpsListener: alb.httpsListener,
      albSecurityGroup: alb.albSecurityGroup,
    });
  }
}
