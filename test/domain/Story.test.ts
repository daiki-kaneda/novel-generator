import { Story } from '../../src/domain/entities/Story';
import { ValidationError } from '../../src/domain/errors/DomainErrors';

describe('Story', () => {
  const validRequest = {
    overview: 'A hero goes on a journey.',
    theme: 'courage',
    characters: 'A young hero',
    userEmail: 'user@example.com',
    requireMetadataApproval: true,
    requirePlanApproval: true,
    requireChapterApproval: false,
    requireFinalApproval: true,
    length: 'short' as const,
  };

  it('submits successfully with a valid request', () => {
    const story = Story.submit(validRequest);

    expect(story.status).toBe('SUBMITTED');
    expect(story.storyId).toHaveLength(36);
    expect(story.request.requireMetadataApproval).toBe(true);
    expect(story.request.requirePlanApproval).toBe(true);
    expect(story.request.requireChapterApproval).toBe(false);
    expect(story.request.requireFinalApproval).toBe(true);
    expect(story.request.length).toBe('short');
  });

  it('defaults requireFinalApproval to the inverse of requireChapterApproval on restore', () => {
    const withChapter = Story.restore({
      storyId: '00000000-0000-4000-8000-000000000001',
      status: 'SUBMITTED',
      request: {
        overview: 'o',
        theme: 't',
        characters: 'c',
        userEmail: 'user@example.com',
        requireMetadataApproval: true,
        requirePlanApproval: true,
        requireChapterApproval: true,
        requireFinalApproval: undefined as unknown as boolean,
        length: 'short',
      },
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(withChapter.request.requireFinalApproval).toBe(false);

    const withoutChapter = Story.restore({
      storyId: '00000000-0000-4000-8000-000000000002',
      status: 'SUBMITTED',
      request: {
        overview: 'o',
        theme: 't',
        characters: 'c',
        userEmail: 'user@example.com',
        requireMetadataApproval: true,
        requirePlanApproval: true,
        requireChapterApproval: false,
        requireFinalApproval: undefined as unknown as boolean,
        length: 'short',
      },
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(withoutChapter.request.requireFinalApproval).toBe(true);
  });

  it('tracks metadata approval wait state', () => {
    const story = Story.submit(validRequest);

    story.awaitApproval('metadata', 'metadata-token');
    expect(story.status).toBe('AWAITING_METADATA_APPROVAL');
    expect(story.currentTaskToken).toBe('metadata-token');
    expect(story.taskStage).toBe('metadata');
  });

  it('tracks chapter approval wait state with the target chapter index', () => {
    const story = Story.submit(validRequest);

    story.awaitApproval('chapter', 'chapter-token', 2);
    expect(story.status).toBe('AWAITING_CHAPTER_APPROVAL');
    expect(story.currentTaskToken).toBe('chapter-token');
    expect(story.taskStage).toBe('chapter');
    expect(story.currentChapterIndex).toBe(2);

    story.clearApproval();
    expect(story.currentChapterIndex).toBeUndefined();
  });

  it('rejects submission when a required field is missing', () => {
    expect(() => Story.submit({ ...validRequest, overview: '' })).toThrow(ValidationError);
  });

  it('rejects submission when the email format is invalid', () => {
    expect(() => Story.submit({ ...validRequest, userEmail: 'not-an-email' })).toThrow(
      ValidationError,
    );
  });

  it('tracks the approval wait state and clears it after a decision', () => {
    const story = Story.submit(validRequest);

    story.awaitApproval('plan', 'task-token-123');
    expect(story.status).toBe('AWAITING_PLAN_APPROVAL');
    expect(story.currentTaskToken).toBe('task-token-123');
    expect(story.taskStage).toBe('plan');

    story.clearApproval();
    expect(story.currentTaskToken).toBeUndefined();
    expect(story.taskStage).toBeUndefined();
  });

  it('marks the story completed with the final S3 key and drops a stale URL', () => {
    const story = Story.submit(validRequest);

    story.complete(`stories/${story.storyId}/final.txt`);

    expect(story.status).toBe('COMPLETED');
    expect(story.finalKey).toBe(`stories/${story.storyId}/final.txt`);
    expect(story.finalUrl).toBeUndefined();
    expect(story.resolveFinalKey()).toBe(`stories/${story.storyId}/final.txt`);
  });

  it('falls back to the deterministic key for legacy completed stories', () => {
    const story = Story.restore({
      storyId: '00000000-0000-4000-8000-000000000099',
      status: 'COMPLETED',
      request: validRequest,
      finalUrl: 'https://example.com/expired',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    expect(story.finalKey).toBeUndefined();
    expect(story.resolveFinalKey()).toBe('stories/00000000-0000-4000-8000-000000000099/final.txt');
  });

  it('does not resolve a final key unless the story is completed', () => {
    const story = Story.submit(validRequest);
    expect(story.resolveFinalKey()).toBeUndefined();
  });

  it('records a workflow failure and clears a stale approval token', () => {
    const story = Story.submit(validRequest);
    story.bindExecution('arn:aws:states:us-east-1:123:execution:novel:exec-1');
    story.awaitApproval('plan', 'stale-token');

    story.fail('TIMED_OUT', 'タイムアウトしました。承認待ちが長すぎたか、生成が時間切れです');

    expect(story.status).toBe('FAILED');
    expect(story.failureKind).toBe('TIMED_OUT');
    expect(story.failureReason).toContain('タイムアウト');
    expect(story.currentTaskToken).toBeUndefined();
    expect(story.taskStage).toBeUndefined();
    expect(story.executionArn).toBe('arn:aws:states:us-east-1:123:execution:novel:exec-1');
  });

  it('does not allow marking a completed story as failed', () => {
    const story = Story.submit(validRequest);
    story.complete(`stories/${story.storyId}/final.txt`);

    expect(() => story.fail('FAILED', '生成ワークフローが失敗しました')).toThrow(ValidationError);
    expect(story.status).toBe('COMPLETED');
  });

  it('clears failure fields when moving to a new status or binding a new execution', () => {
    const story = Story.submit(validRequest);
    story.fail('FAILED', '生成ワークフローが失敗しました');

    story.moveTo('CHAPTERS_GENERATING');
    expect(story.status).toBe('CHAPTERS_GENERATING');
    expect(story.failureKind).toBeUndefined();
    expect(story.failureReason).toBeUndefined();

    story.fail('ABORTED', '実行が中断されました');
    story.bindExecution('arn:aws:states:us-east-1:123:execution:novel:retry');
    expect(story.failureKind).toBeUndefined();
    expect(story.failureReason).toBeUndefined();
  });

  it('rejects moveTo(FAILED) so failures go through fail()', () => {
    const story = Story.submit(validRequest);
    expect(() => story.moveTo('FAILED')).toThrow(ValidationError);
  });
});
