/** 指定されたリソース（物語・プラン・章など）が存在しない場合のエラー。 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** 入力値やワークフロー状態が不正なため処理を継続できない場合のエラー。 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** 認証済みだが、対象リソース（物語など）の所有者でないため操作が許可されない場合のエラー。 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** 月間利用コストがプランの上限に達しているため、新規の生成開始を拒否する場合のエラー。 */
export class BudgetExceededError extends Error {
  readonly planTier: string;
  readonly monthlyCostUsd: number;
  readonly monthlyBudgetUsd: number;

  constructor(planTier: string, monthlyCostUsd: number, monthlyBudgetUsd: number) {
    super(
      `Monthly usage budget exceeded for plan "${planTier}": ` +
        `$${monthlyCostUsd.toFixed(2)} used of $${monthlyBudgetUsd.toFixed(2)} limit`,
    );
    this.name = 'BudgetExceededError';
    this.planTier = planTier;
    this.monthlyCostUsd = monthlyCostUsd;
    this.monthlyBudgetUsd = monthlyBudgetUsd;
  }
}

/** TKG 矛盾検出時。Step Functions の Catch で捕捉する。 */
export class ContradictionDetectedError extends Error {
  readonly contradictions: Array<{
    newFact: string;
    conflictingFact: string;
    reason: string;
  }>;

  constructor(
    message: string,
    contradictions: Array<{ newFact: string; conflictingFact: string; reason: string }> = [],
  ) {
    super(message);
    this.name = 'ContradictionDetectedError';
    this.contradictions = contradictions;
  }
}
