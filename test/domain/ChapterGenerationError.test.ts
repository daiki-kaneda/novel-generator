import {
  formatContradictionUserMessage,
  parseChapterGenerationError,
  serializeContradictionError,
} from '../../src/domain/value-objects/ChapterGenerationError';

describe('parseChapterGenerationError', () => {
  it('extracts a user-facing contradiction message and details from a Lambda Cause JSON', () => {
    const contradictions = [
      {
        newFact: '主人公が剣を持っている',
        conflictingFact: '主人公は剣を失った',
        reason: '失ったものを所持できない',
      },
    ];
    const cause = JSON.stringify({
      errorType: 'ContradictionDetectedError',
      errorMessage: serializeContradictionError(2, contradictions),
      trace: ['ContradictionDetectedError: ...', '    at GenerateChapterUseCase.execute'],
    });

    const parsed = parseChapterGenerationError(2, {
      Error: 'ContradictionDetectedError',
      Cause: cause,
    });

    expect(parsed.kind).toBe('contradiction');
    expect(parsed.message).toBe(formatContradictionUserMessage(2, contradictions));
    expect(parsed.message).not.toContain('errorType');
    expect(parsed.message).not.toContain('at GenerateChapterUseCase');
    expect(parsed.contradictions).toEqual(contradictions);
  });

  it('does not surface truncated Lambda JSON as the user-facing message', () => {
    const parsed = parseChapterGenerationError(1, {
      Error: 'Error',
      Cause: '{"errorType":"Error","errorMessage":"Plan does not contain chapter index 1","trace":["Error:',
    });

    expect(parsed.kind).toBe('unknown');
    expect(parsed.message).toBe(
      '第1章の本文生成に失敗しました。展開を変える指示を出して再生成してください。',
    );
    expect(parsed.message).not.toContain('errorType');
    expect(parsed.message).not.toContain('Plan does not contain');
  });

  it('maps timeout and throttle error names to dedicated Japanese copy', () => {
    expect(
      parseChapterGenerationError(3, { Error: 'TimeoutError', Cause: 'Task timed out' }).message,
    ).toContain('時間切れ');
    expect(
      parseChapterGenerationError(3, { Error: 'ThrottlingException', Cause: 'Rate exceeded' }).kind,
    ).toBe('throttled');
  });
});
