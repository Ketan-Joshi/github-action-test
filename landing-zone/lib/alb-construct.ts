// landing-zone/lib/alb-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { config } from '../../shared/config';

export interface AlbConstructProps {
  vpc: ec2.Vpc;
}

export class AlbConstruct extends Construct {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly httpsListener: elbv2.ApplicationListener;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    const { vpc } = props;

    // ALB Security Group
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'Shared ALB — allows HTTP/HTTPS from internet',
      allowAllOutbound: false,
    });

    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP from internet');
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from internet');
    // Egress to any ECS task on any port — ECS SGs restrict the other side
    this.albSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp(), 'Outbound to ECS tasks');

    // Shared public ALB in public subnets
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'SharedAlb', {
      vpc,
      internetFacing: true,
      securityGroup: this.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      deletionProtection: false, // set true for prod
      dropInvalidHeaderFields: true,
    });

    // Hosted zone lookup
    this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.alb.hostedZoneName,
    });

    // Wildcard ACM certificate — covers ALL subdomains (*.in.cld)
    // so adding new apps never requires a new cert
    const certificate = new acm.Certificate(this, 'WildcardCert', {
      domainName: config.alb.certificateDomainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // HTTP → HTTPS redirect
    this.alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        port: '443',
        protocol: 'HTTPS',
        permanent: true,
      }),
    });

    // Shared HTTPS listener — ECS stacks attach target groups to this
    this.httpsListener = this.alb.addListener('HttpsListener', {
      port: 443,
      certificates: [certificate],
      // Default 404 — each app adds its own listener rule
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'No route matched',
      }),
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
    });

    // Outputs — ECS stacks import these
    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.alb.loadBalancerArn,
      exportName: 'LandingZone-AlbArn',
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      exportName: 'LandingZone-AlbDnsName',
    });

    new cdk.CfnOutput(this, 'HttpsListenerArn', {
      value: this.httpsListener.listenerArn,
      exportName: 'LandingZone-HttpsListenerArn',
    });

    new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
      value: this.albSecurityGroup.securityGroupId,
      exportName: 'LandingZone-AlbSgId',
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      exportName: 'LandingZone-HostedZoneId',
    });
  }
}
