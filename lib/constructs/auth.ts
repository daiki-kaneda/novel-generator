import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * メール+パスワードのセルフサインアップに対応した Cognito User Pool と、
 * ブラウザSPA（パブリッククライアント、シークレットなし）用の User Pool Client。
 *
 * Hosted UI / OAuth は使わない。フロントエンドは Cognito Identity SDK（SRP認証）で
 * 直接サインアップ/サインインし、発行されたIDトークンをHTTP APIの
 * Authorization ヘッダーに付与する（`HttpUserPoolAuthorizer`が検証する）。
 */
export class NovelAuth extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      authFlows: {
        userSrp: true,
      },
      generateSecret: false,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });
  }
}
