import { BudgetExceededError } from '../../domain/errors/DomainErrors';
import { currentYearMonth, PLAN_PRESETS } from '../../domain/value-objects/UsagePlan';
import { UsageAccountRepository } from '../ports/UsageAccountRepository';

/**
 * 新規の生成開始（投稿・改訂開始・承認決定）の前に、当月の利用コストがプラン上限に
 * 達していないか検証する。すでに進行中のワークフロー内部の生成呼び出しはここでは
 * 止めない（Bedrock呼び出し自体の記録は BedrockNovelTextGenerator 側でベストエフォートに行う）。
 */
export async function assertWithinUsageBudget(
  usageAccountRepository: UsageAccountRepository,
  userEmail: string,
): Promise<void> {
  const planTier = await usageAccountRepository.getPlanTier(userEmail);
  const preset = PLAN_PRESETS[planTier];
  const usage = await usageAccountRepository.getMonthlyUsage(userEmail, currentYearMonth());

  if (usage.totalCostUsd >= preset.monthlyBudgetUsd) {
    throw new BudgetExceededError(planTier, usage.totalCostUsd, preset.monthlyBudgetUsd);
  }
}
