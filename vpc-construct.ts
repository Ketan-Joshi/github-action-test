// landing-zone/lib/vpc-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { config } from '../../shared/config';

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.vpc.cidr),
      maxAzs: config.vpc.maxAzs,
      natGateways: config.vpc.natGateways,

      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],

      // Enable DNS for ECS service discovery
      enableDnsHostnames: true,
      enableDnsSupport: true,

      // Restrict default security group (security best practice)
      restrictDefaultSecurityGroup: true,
    });

    // VPC Flow Logs — security best practice for auditing traffic
    this.vpc.addFlowLog('FlowLogCloudWatch', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // SSM exports — allows ECS stack to import without hard coupling
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: 'LandingZone-VpcId',
    });

    new cdk.CfnOutput(this, 'PublicSubnets', {
      value: this.vpc.publicSubnets.map((s) => s.subnetId).join(','),
      exportName: 'LandingZone-PublicSubnetIds',
    });

    new cdk.CfnOutput(this, 'PrivateSubnets', {
      value: this.vpc.privateSubnets.map((s) => s.subnetId).join(','),
      exportName: 'LandingZone-PrivateSubnetIds',
    });
  }
}
