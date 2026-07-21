/**
 * アプリケーション全体で共有する設定値。
 * Bedrockのモデルidをここに集約し、変更時の影響範囲を最小化する。
 */
export const appConfig = {
  bedrock: {
    /** プラン生成・章生成・要約生成・改訂プラン生成すべてで使用するモデル */
    modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  novel: {
    /** 最終テキストの署名付きURLの有効期限（秒） */
    finalUrlExpirySeconds: 60 * 60 * 24 * 7,
  },
  notification: {
    /**
     * SESの送信元アドレス。SESで検証済みのID（メールアドレス/ドメイン）である必要がある。
     * `cdk deploy` 時に `-c notificationFromAddress=you@example.com` で上書きすることを想定。
     */
    fromAddress: process.env.NOTIFICATION_FROM_ADDRESS ?? 'noreply@example.com',
  },
} as const;
