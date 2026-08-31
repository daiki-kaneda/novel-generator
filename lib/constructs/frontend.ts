import * as path from 'path';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface NovelFrontendProps {
  /** Reactアプリからのfetch先となるHTTP APIのベースURL（末尾スラッシュなし）。 */
  apiEndpoint: string;
  /** ユーザー認証用 Cognito User Pool ID。 */
  userPoolId: string;
  /** フロントエンド（SPA）用 Cognito User Pool Client ID。 */
  userPoolClientId: string;
}

const FRONTEND_DIST_DIR = path.join(__dirname, '..', '..', 'frontend', 'dist');

/**
 * Reactフロントエンドを S3（非公開バケット + OAC）+ CloudFront で配信するコンストラクト。
 *
 * - `frontend/dist`（事前に`npm run build`されたビルド物）をS3に配置し、CloudFront経由でのみ配信する。
 * - `config.json` はビルド物と分離してデプロイ時にここで注入する。CDKの外側（`httpApi.apiEndpoint`）で
 *   しか確定しない値をランタイム設定として渡すことで、インフラ更新のたびにフロントを再ビルドする必要がない。
 * - SPAのため、S3が返す403/404はCloudFrontで`index.html`（200）にフォールバックし、
 *   クライアントサイドルーティング（`/stories/:storyId`等）を機能させる。
 */
export class NovelFrontend extends Construct {
  readonly distribution: cloudfront.Distribution;
  readonly siteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: NovelFrontendProps) {
    super(scope, id);

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // 検索エンジンにインデックスさせない（storyIdがURLに含まれる、ログイン必須のプライベートなアプリのため）。
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
      customHeadersBehavior: {
        customHeaders: [{ header: 'X-Robots-Tag', value: 'noindex, nofollow', override: true }],
      },
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.SAME_ORIGIN,
          override: true,
        },
      },
    });

    const origin = origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket);

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: '小説生成ワークフロー フロントエンド',
      defaultRootObject: 'index.html',
      // index.html/config.json/SPAフォールバックは常に最新を取得する（キャッシュ無効）。
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy,
      },
      // Viteが出力するハッシュ付きファイル名のアセットは内容が変わればパスも変わるため、長期キャッシュしてよい。
      additionalBehaviors: {
        '/assets/*': {
          origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy,
        },
      },
      // S3(REST)は存在しないキーに403/404を返す。SPAルーティングのためindex.htmlへフォールバックする。
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [
        s3deploy.Source.asset(FRONTEND_DIST_DIR),
        // apiEndpointやCognito IDはデプロイ時にしか確定しないため、ビルド物とは別にランタイム設定として配置する。
        s3deploy.Source.jsonData('config.json', {
          apiBaseUrl: props.apiEndpoint,
          cognitoUserPoolId: props.userPoolId,
          cognitoUserPoolClientId: props.userPoolClientId,
        }),
      ],
      destinationBucket: this.siteBucket,
      distribution: this.distribution,
      distributionPaths: ['/index.html', '/config.json'],
      prune: true,
    });
  }
}
