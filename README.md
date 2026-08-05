# novel-generator

AWS 上で短編〜中編の日本語小説を生成するサーバーレスワークフローです。

ユーザーが概要・テーマ・登場人物などのシードを送ると、設定書（メタデータ）→ プラン → 章本文 → 最終原稿までを StepFunctions がオーケストレーションします。各段階で承認ゲートを挟めます（スキップも可能）。承認処理はStepFunctionsのWaitForTaskTokenを利用しています。(各トークンはDynamoDBのStoryレコードに記録されるため、ユーザーはレコードのidのみを知っていれば、ワークフロー再開のためのAPIを叩けます)

## Architecture

```
HTTP API  →  SQS  →  EventBridge Pipe  →  Step Functions
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                        ▼                        ▼
               Bedrock (生成)           DynamoDB (状態)            S3 (本文)
                     │
                     └─ SES（完成通知・任意）
```

主なコンストラクト:

| Construct | 役割 |
|---|---|
| `NovelStorage` | DynamoDB（Story / Plan / Chapter / TKG）と S3（章・最終本文） |
| `NovelWorkflow` | Step Functions + 生成・承認・Finalize 用 Lambda |
| `NovelIngestion` | 投稿キュー（SQS）と Pipe |
| `NovelApi` | HTTP API（投稿・状態取得・承認・改訂） |

### Step Functions workflow

ステートマシン全体図（AWS コンソールからエクスポートした画像を配置予定）:

![Step Functions workflow](docs/images/step-functions-workflow.svg)

おおまかな流れ:

1. **BindExecution** … 実行 ARN をロック
2. **GenerateMetadata** … 設定書生成 →（任意）メタデータ承認
3. **GeneratePlan** … 章構成生成 →（任意）プラン承認
4. **GenerateChapters (Map)** … 章本文生成・事実抽出・未来プラン再整合 →（任意）章承認
5. **Final approval / Finalize** …（任意）最終承認のあと本文連結・通知
6. **Revision path** … 最終拒否や `POST .../revisions` から指定章以降を部分再生成

承認フラグ（`POST /stories`）:

| フラグ | 省略時デフォルト |
|---|---|
| `requireMetadataApproval` | `true` |
| `requirePlanApproval` | `true` |
| `requireChapterApproval` | `false` |
| `requireFinalApproval` | `!requireChapterApproval`（従来の「章オフ＝最終オン」を維持） |

評価バッチなどで無承認完走する場合は、4 つとも `false` を明示します。

## API (overview)

| Method | Path | 説明 |
|---|---|---|
| `POST` | `/stories` | 物語を投稿しワークフロー開始 |
| `GET` | `/stories/{storyId}` | 進行状況・設定書・プラン・章一覧 |
| `GET` | `/stories/{storyId}/chapters/{chapterIndex}/content` | 章本文の署名付き URL |
| `POST` | `/stories/{storyId}/metadata/decision` | 設定書の承認/拒否 |
| `POST` | `/stories/{storyId}/plan/decision` | プランの承認/拒否 |
| `POST` | `/stories/{storyId}/chapters/{chapterIndex}/decision` | 章の承認/拒否 |
| `POST` | `/stories/{storyId}/final/decision` | 最終原稿の承認/拒否 |
| `POST` | `/stories/{storyId}/revisions` | 指定章以降の部分再生成を開始 |

`POST /stories` の主なボディ:

```json
{
  "overview": "孤島の灯台守が嵐の夜に漂流者を拾う",
  "theme": "孤独と赦し",
  "characters": "灯台守・アキラ、漂流者・ユキ",
  "tone": "静謐で少し不気味",
  "setting": "孤島の灯台",
  "length": "short",
  "userEmail": "you@example.com",
  "requireMetadataApproval": true,
  "requirePlanApproval": true,
  "requireChapterApproval": false,
  "requireFinalApproval": true
}
```

`length` は `short`（既定）または `medium` です。

## Prerequisites

- Node.js と npm
- AWS CDK CLI（`npx cdk` で可）
- デプロイ先アカウントで Bedrock モデルアクセスが有効であること
- 完成メールを送る場合は SES で検証済みの送信元アドレス

## Setup / Deploy

```bash
npm ci
npm test
npx cdk synth
NOTIFICATION_FROM_ADDRESS=you@example.com 
npx cdk deploy
```

環境変数でも上書きできます。

| 変数 | 用途 |
|---|---|
| `BEDROCK_MODEL_ID` | Converse に渡す推論プロファイル ID |
| `NOTIFICATION_FROM_ADDRESS` | SES 送信元 |
| `CDK_DEFAULT_REGION` / `CDK_DEFAULT_ACCOUNT` | デプロイ先（任意） |

デプロイ後、スタック出力の `ApiUrl` と `StateMachineArn` を控えてください。

## Evaluation seeds

品質評価用の第1ラウンドシードと投入スクリプトがあります。

- [`eval/round1-seeds.json`](eval/round1-seeds.json) … short×8 + medium×2、全承認オフ
- [`eval/submit-round1.ts`](eval/submit-round1.ts) … `POST /stories` 一括投入

```bash
# 送信内容の確認のみ
DRY_RUN=1 EVAL_USER_EMAIL=you@example.com npx ts-node eval/submit-round1.ts

# 実投入（デプロイ済み API が必要）
API_BASE_URL=https://xxxx.execute-api.ap-northeast-1.amazonaws.com \
EVAL_USER_EMAIL=you@example.com \
npx ts-node eval/submit-round1.ts
```

## Project layout

```
bin/                 CDK アプリエントリ
lib/                 CDK スタック / コンストラクト
src/application/     ユースケースとポート
src/domain/          ドメインモデル
src/infrastructure/  AWS SDK アダプタ（Bedrock / DynamoDB / S3 / SES / SFN / SQS）
src/interface/       Lambda ハンドラと DI コンテナ
eval/                評価用シードと投入スクリプト
docs/images/         アーキテクチャ図・ワークフロー図
test/                Jest テスト
```

## Useful commands

* `npm run build` — TypeScript コンパイル
* `npm run watch` — 変更監視コンパイル
* `npm test` — Jest
* `npx cdk deploy` — デプロイ
* `npx cdk diff` — 差分確認
* `npx cdk synth` — CloudFormation テンプレート生成

