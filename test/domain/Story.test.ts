import { Story } from '../../src/domain/entities/Story';
import { ValidationError } from '../../src/domain/errors/DomainErrors';

describe('Story', () => {
  const validRequest = {
    overview: 'A hero goes on a journey.',
    theme: 'courage',
    characters: 'A young hero',
    userEmail: 'user@example.com',
    requirePlanApproval: true,
    requireChapterApproval: false,
    length: 'short' as const,
  };

  it('submits successfully with a valid request', () => {
    const story = Story.submit(validRequest);

    expect(story.status).toBe('SUBMITTED');
    expect(story.storyId).toHaveLength(36);
    expect(story.request.requirePlanApproval).toBe(true);
    expect(story.request.requireChapterApproval).toBe(false);
    expect(story.request.length).toBe('short');
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

  it('marks the story completed with the final URL', () => {
    const story = Story.submit(validRequest);

    story.complete('https://example.com/final.txt');

    expect(story.status).toBe('COMPLETED');
    expect(story.finalUrl).toBe('https://example.com/final.txt');
  });
});
