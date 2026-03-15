// landing-zone/lib/landing-zone-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from './vpc-construct';
import { config } from '../../shared/config';

export class LandingZoneStack extends cdk.Stack {
  public readonly vpcConstruct: VpcConstruct;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Apply tags to all resources in this stack
    Object.entries(config.tags).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });

    this.vpcConstruct = new VpcConstruct(this, 'VpcConstruct');
  }
}
