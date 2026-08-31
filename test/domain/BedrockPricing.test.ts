import { calculateUsageCostUsd } from '../../src/domain/value-objects/BedrockPricing';

describe('calculateUsageCostUsd', () => {
  it('calculates cost for a known Sonnet model', () => {
    const cost = calculateUsageCostUsd('anthropic.claude-sonnet-4-6', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 6);
  });

  it('calculates cost for a known Haiku model', () => {
    const cost = calculateUsageCostUsd('anthropic.claude-haiku-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1 + 5, 6);
  });

  it('treats the JP cross-region inference profile the same as the foundation model', () => {
    const cost = calculateUsageCostUsd('jp.anthropic.claude-sonnet-4-6', 500_000, 100_000);
    expect(cost).toBeCloseTo(500_000 / 1_000_000 * 3 + 100_000 / 1_000_000 * 15, 6);
  });

  it('returns 0 for an unknown modelId instead of throwing', () => {
    const cost = calculateUsageCostUsd('some-future-model', 1_000_000, 1_000_000);
    expect(cost).toBe(0);
  });
});
