import { describe, expect, it } from 'vitest';
import { neighboringDoneChapters } from './chapterNav';

const chapters = [
  { index: 1, status: 'DONE' as const },
  { index: 2, status: 'DONE' as const },
  { index: 3, status: 'PENDING' as const },
];

describe('neighboringDoneChapters', () => {
  it('returns the previous and next generated chapters', () => {
    expect(neighboringDoneChapters(chapters, 2)).toEqual({ prev: 1, next: undefined });
    expect(neighboringDoneChapters(chapters, 1)).toEqual({ prev: undefined, next: 2 });
  });

  it('returns empty neighbors when the current chapter is not generated', () => {
    expect(neighboringDoneChapters(chapters, 3)).toEqual({});
  });
});
