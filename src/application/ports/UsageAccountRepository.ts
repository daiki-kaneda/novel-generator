import { PlanTier } from '../../domain/value-objects/UsagePlan';

export interface RecordUsageInput {
  storyId: string;
  chapterIndex?: number;
  /** BedrockNovelTextGenerator の BedrockConversePhase 文字列。ドメイン層に依存を作らないため string で受ける。 */
  phase: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface MonthlyUsage {
  yearMonth: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** Bedrock呼び出しのコストを記録するロール。BedrockNovelTextGeneratorはこれだけに依存する。 */
export interface UsageRecorder {
  /** 呼び出し1回分の使用量を当月分の集計に加算する。失敗しても呼び出し元の生成処理は止めない前提の実装にすること。 */
  recordUsage(userEmail: string, input: RecordUsageInput): Promise<void>;
}

/**
 * メールアドレスをアカウントキーとした、プラン割当と月次使用量集計の永続化を抽象化するポート。
 * ユーザー認証を必須にしないため、認証済みユーザーIDではなく`StoryRequest.userEmail`をキーにする。
 */
export interface UsageAccountRepository extends UsageRecorder {
  /** レコードが存在しない場合は 'free' を返す（決済連携なしの初期状態）。 */
  getPlanTier(userEmail: string): Promise<PlanTier>;
  getMonthlyUsage(userEmail: string, yearMonth: string): Promise<MonthlyUsage>;
}
