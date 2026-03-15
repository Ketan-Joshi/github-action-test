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
      enableDnsHostnames: true,
      enableDnsSupport: true,
      restrictDefaultSecurityGroup: true,
    });

    // VPC Flow Logs for traffic auditing
    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // Exports for cross-stack use
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
