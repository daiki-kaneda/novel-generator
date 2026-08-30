export interface BedrockModelPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

/**
 * Bedrock Converse 呼び出しのモデル別価格（USD / 100万トークン、on-demand・非バッチ想定）。
 * `jp.` などのクロスリージョン推論プロファイルは基盤モデルと同額として扱う（実際は数%の差異があり得るが、
 * 予算管理の目的では基盤モデル価格を近似値として使う）。
 * 新しいモデルIDに切り替える場合は、ここに価格を追加しないと当該モデルの使用コストが0円として記録される。
 */
export const BEDROCK_MODEL_PRICING: Record<string, BedrockModelPricing> = {
  'anthropic.claude-sonnet-4-6': { inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15 },
  'jp.anthropic.claude-sonnet-4-6': { inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15 },
  'anthropic.claude-haiku-4-5': { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5 },
  'jp.anthropic.claude-haiku-4-5': { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5 },
};

/**
 * 呼び出し1回分のコスト（USD）を計算する。
 * 価格未登録のmodelIdは0を返す（コスト計測不能を静かに無視し、生成自体は止めない）。
 */
export function calculateUsageCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = BEDROCK_MODEL_PRICING[modelId];
  if (!pricing) {
    return 0;
  }
  return (
    (inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens
  );
}
