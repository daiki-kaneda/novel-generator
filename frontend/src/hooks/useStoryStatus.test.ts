import { describe, expect, it } from 'vitest';
import { pollIntervalFor } from './useStoryStatus';

describe('pollIntervalFor', () => {
  it('stops polling when the workflow has finished or failed', () => {
    expect(pollIntervalFor(undefined)).toBe(false);
    expect(pollIntervalFor('COMPLETED')).toBe(false);
    expect(pollIntervalFor('FAILED')).toBe(false);
  });

  it('polls slowly while awaiting approval and quickly while generating', () => {
    expect(pollIntervalFor('AWAITING_PLAN_APPROVAL')).toBe(15_000);
    expect(pollIntervalFor('CHAPTERS_GENERATING')).toBe(3_000);
  });
});
