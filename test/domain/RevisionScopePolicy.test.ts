import { RevisionScopePolicy } from '../../src/domain/services/RevisionScopePolicy';

describe('RevisionScopePolicy.resolve', () => {
  it('filters out instructions for chapters that do not exist', () => {
    const result = RevisionScopePolicy.resolve(
      [
        { chapterIndex: 1, instruction: 'fix the opening' },
        { chapterIndex: 99, instruction: 'this chapter does not exist' },
      ],
      [1, 2, 3],
    );

    expect(result).toEqual([{ chapterIndex: 1, instruction: 'fix the opening' }]);
  });

  it('filters out empty or whitespace-only instructions', () => {
    const result = RevisionScopePolicy.resolve([{ chapterIndex: 1, instruction: '   ' }], [1]);

    expect(result).toEqual([]);
  });

  it('keeps only the latest instruction when the same chapter is targeted twice', () => {
    const result = RevisionScopePolicy.resolve(
      [
        { chapterIndex: 2, instruction: 'first pass' },
        { chapterIndex: 2, instruction: 'second pass' },
      ],
      [1, 2],
    );

    expect(result).toEqual([{ chapterIndex: 2, instruction: 'second pass' }]);
  });

  it('sorts the resolved instructions by chapter index', () => {
    const result = RevisionScopePolicy.resolve(
      [
        { chapterIndex: 3, instruction: 'c3' },
        { chapterIndex: 1, instruction: 'c1' },
      ],
      [1, 2, 3],
    );

    expect(result.map((item) => item.chapterIndex)).toEqual([1, 3]);
  });
});
