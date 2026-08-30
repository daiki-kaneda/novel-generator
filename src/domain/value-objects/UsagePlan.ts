/**
 * 課金プラン。認証必須にはせず、投稿時に受け取るメールアドレスをアカウントキーとして扱う。
 * 決済連携は未実装のため、`pro`への昇格は運用者がAccountRepository側のレコードを手動で
 * 作成/更新することを想定する（次段のスコープ）。
 */
export type PlanTier = 'free' | 'pro';

export interface PlanPreset {
  /** 月間のBedrock利用コスト上限（USD）。これを超えると新規の生成開始を拒否する。 */
  monthlyBudgetUsd: number;
}

export const PLAN_PRESETS: Record<PlanTier, PlanPreset> = {
  free: { monthlyBudgetUsd: 2 },
  pro: { monthlyBudgetUsd: 30 },
};

export function resolvePlanTier(value: unknown): PlanTier {
  return value === 'pro' ? 'pro' : 'free';
}

/** UTCの "YYYY-MM" 形式。月次使用量の集計キーに使う。 */
export function currentYearMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** アカウントキーとして使うメールアドレスを正規化する（大文字小文字・前後空白のゆらぎを吸収）。 */
export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}
