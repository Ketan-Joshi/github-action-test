// ecs-app/lib/alb-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { config } from '../../shared/config';

export interface AlbConstructProps {
  vpc: ec2.IVpc;
}

export class AlbConstruct extends Construct {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly httpsListener: elbv2.ApplicationListener;
  public readonly albSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    const { vpc } = props;

    // ALB Security Group — only allow 80 (redirect) and 443 from internet
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'Security group for public ALB',
      allowAllOutbound: false,
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from internet'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from internet'
    );

    // Allow ALB to reach ECS containers on port 80
    this.albSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(config.ecs.containerPort),
      'Allow outbound to ECS containers'
    );

    // Public ALB — lives in public subnets
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: this.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      deletionProtection: false, // set true for prod
      dropInvalidHeaderFields: true, // security best practice
    });

    // Look up hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.dns.hostedZoneName,
    });

    // ACM Certificate with DNS validation
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: config.dns.fqdn,
      validation: acm.CertificateValidation.fromDns(hostedZone),
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

    // HTTPS listener with ACM cert
    this.httpsListener = this.alb.addListener('HttpsListener', {
      port: 443,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not found',
      }),
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS, // TLS 1.2+ only
    });

    // Route53 A record → ALB
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: config.dns.recordName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(this.alb)
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      exportName: 'EcsApp-AlbDnsName',
    });

    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${config.dns.fqdn}`,
      description: 'Application URL',
    });
  }
}
