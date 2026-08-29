import { describe, expect, it } from 'vitest';
import { isAwaitingApproval, isInProgress, STORY_STATUS_LABELS } from './statusLabels';

describe('statusLabels', () => {
  it('has a Japanese label for every StoryStatus', () => {
    expect(Object.keys(STORY_STATUS_LABELS)).toEqual([
      'SUBMITTED',
      'METADATA_GENERATING',
      'AWAITING_METADATA_APPROVAL',
      'PLAN_GENERATING',
      'AWAITING_PLAN_APPROVAL',
      'CHAPTERS_GENERATING',
      'AWAITING_CHAPTER_APPROVAL',
      'AWAITING_FINAL_APPROVAL',
      'REVISING',
      'COMPLETED',
    ]);
  });

  it.each([
    ['AWAITING_METADATA_APPROVAL', true],
    ['AWAITING_PLAN_APPROVAL', true],
    ['AWAITING_CHAPTER_APPROVAL', true],
    ['AWAITING_FINAL_APPROVAL', true],
    ['SUBMITTED', false],
    ['COMPLETED', false],
  ] as const)('isAwaitingApproval(%s) === %s', (status, expected) => {
    expect(isAwaitingApproval(status)).toBe(expected);
  });

  it.each([
    ['SUBMITTED', true],
    ['METADATA_GENERATING', true],
    ['CHAPTERS_GENERATING', true],
    ['AWAITING_METADATA_APPROVAL', false],
    ['COMPLETED', false],
  ] as const)('isInProgress(%s) === %s', (status, expected) => {
    expect(isInProgress(status)).toBe(expected);
  });
});
