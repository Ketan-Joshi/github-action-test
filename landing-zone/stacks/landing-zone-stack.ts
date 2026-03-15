// landing-zone/stacks/landing-zone-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from '../constructs/vpc-construct';
import { AlbConstruct } from '../constructs/alb-construct';
import { config } from '../../shared/config';

export class LandingZoneStack extends cdk.Stack {
  public readonly vpcConstruct: VpcConstruct;
  public readonly albConstruct: AlbConstruct;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    Object.entries(config.tags).forEach(([k, v]: [string, string]) => cdk.Tags.of(this).add(k, v));

    // Construct 1: VPC — 2 public + 2 private subnets, 1 NAT GW
    this.vpcConstruct = new VpcConstruct(this, 'VpcConstruct');

    // Construct 2: Shared ALB — one ALB for all ECS apps
    this.albConstruct = new AlbConstruct(this, 'AlbConstruct', {
      vpc: this.vpcConstruct.vpc,
    });
  }
}