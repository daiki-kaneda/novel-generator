import {
  currentYearMonth,
  normalizeAccountEmail,
  PLAN_PRESETS,
  resolvePlanTier,
} from '../../src/domain/value-objects/UsagePlan';

describe('resolvePlanTier', () => {
  it('resolves "pro" only for the literal value', () => {
    expect(resolvePlanTier('pro')).toBe('pro');
  });

  it('defaults everything else to "free"', () => {
    expect(resolvePlanTier(undefined)).toBe('free');
    expect(resolvePlanTier(null)).toBe('free');
    expect(resolvePlanTier('enterprise')).toBe('free');
  });
});

describe('PLAN_PRESETS', () => {
  it('gives the pro tier a strictly higher budget than free', () => {
    expect(PLAN_PRESETS.pro.monthlyBudgetUsd).toBeGreaterThan(PLAN_PRESETS.free.monthlyBudgetUsd);
  });
});

describe('currentYearMonth', () => {
  it('formats as UTC YYYY-MM', () => {
    expect(currentYearMonth(new Date('2026-01-05T23:00:00Z'))).toBe('2026-01');
    expect(currentYearMonth(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});

describe('normalizeAccountEmail', () => {
  it('trims whitespace and lowercases the address', () => {
    expect(normalizeAccountEmail('  User@Example.com  ')).toBe('user@example.com');
  });
});
