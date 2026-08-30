import { BindExecutionUseCase } from '../../src/application/use-cases/BindExecutionUseCase';
import { ClearExecutionUseCase } from '../../src/application/use-cases/ClearExecutionUseCase';
import { Story } from '../../src/domain/entities/Story';
import { ValidationError } from '../../src/domain/errors/DomainErrors';
import { FakeStoryRepository } from './support/fakes';

describe('BindExecutionUseCase', () => {
  it('binds executionArn when none is set', async () => {
    const repo = new FakeStoryRepository();
    const story = Story.submit({
      overview: 'o',
      theme: 't',
      characters: 'c',
      userEmail: 'u@example.com',
      requireMetadataApproval: false,
      requirePlanApproval: false,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    });
    await repo.createStory(story);

    const useCase = new BindExecutionUseCase(repo);
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    const output = await useCase.execute({ storyId: story.storyId, executionArn: arn });

    expect(output.executionArn).toBe(arn);
    expect((await repo.getStory(story.storyId)).executionArn).toBe(arn);
  });

  it('is idempotent when the same ARN is already bound', async () => {
    const repo = new FakeStoryRepository();
    const story = Story.submit({
      overview: 'o',
      theme: 't',
      characters: 'c',
      userEmail: 'u@example.com',
      requireMetadataApproval: false,
      requirePlanApproval: false,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    });
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    story.bindExecution(arn);
    await repo.createStory(story);

    const useCase = new BindExecutionUseCase(repo);
    await useCase.execute({ storyId: story.storyId, executionArn: arn });

    expect((await repo.getStory(story.storyId)).executionArn).toBe(arn);
  });

  it('rejects when a different ARN is already bound', async () => {
    const repo = new FakeStoryRepository();
    const story = Story.submit({
      overview: 'o',
      theme: 't',
      characters: 'c',
      userEmail: 'u@example.com',
      requireMetadataApproval: false,
      requirePlanApproval: false,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    });
    story.bindExecution('arn:aws:states:us-east-1:123:execution:novel:other');
    await repo.createStory(story);

    const useCase = new BindExecutionUseCase(repo);
    await expect(
      useCase.execute({
        storyId: story.storyId,
        executionArn: 'arn:aws:states:us-east-1:123:execution:novel:new',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

function submitStory() {
  return Story.submit({
    overview: 'o',
    theme: 't',
    characters: 'c',
    userEmail: 'u@example.com',
    requireMetadataApproval: false,
    requirePlanApproval: false,
    requireChapterApproval: false,
    requireFinalApproval: true,
    length: 'short',
  });
}

describe('ClearExecutionUseCase', () => {
  it('clears only when executionArn matches', async () => {
    const repo = new FakeStoryRepository();
    const story = submitStory();
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    story.bindExecution(arn);
    story.moveTo('CHAPTERS_GENERATING');
    await repo.createStory(story);

    const useCase = new ClearExecutionUseCase(repo);
    const output = await useCase.execute({
      storyId: story.storyId,
      executionArn: arn,
      executionStatus: 'SUCCEEDED',
    });

    const saved = await repo.getStory(story.storyId);
    expect(output.cleared).toBe(true);
    expect(saved.executionArn).toBeUndefined();
    expect(saved.status).toBe('CHAPTERS_GENERATING');
    expect(saved.failureKind).toBeUndefined();
  });

  it('does not clear when executionArn does not match', async () => {
    const repo = new FakeStoryRepository();
    const story = submitStory();
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    story.bindExecution(arn);
    story.moveTo('CHAPTERS_GENERATING');
    await repo.createStory(story);

    const useCase = new ClearExecutionUseCase(repo);
    const output = await useCase.execute({
      storyId: story.storyId,
      executionArn: 'arn:aws:states:us-east-1:123:execution:novel:other',
      executionStatus: 'FAILED',
    });

    const saved = await repo.getStory(story.storyId);
    expect(output.cleared).toBe(false);
    expect(saved.executionArn).toBe(arn);
    expect(saved.status).toBe('CHAPTERS_GENERATING');
    expect(saved.failureKind).toBeUndefined();
  });

  it.each(['FAILED', 'TIMED_OUT', 'ABORTED'] as const)(
    'marks the story FAILED and releases the lock on %s',
    async (executionStatus) => {
      const repo = new FakeStoryRepository();
      const story = submitStory();
      const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
      story.bindExecution(arn);
      story.awaitApproval('plan', 'stale-token');
      await repo.createStory(story);

      const useCase = new ClearExecutionUseCase(repo);
      const output = await useCase.execute({
        storyId: story.storyId,
        executionArn: arn,
        executionStatus,
      });

      const saved = await repo.getStory(story.storyId);
      expect(output.cleared).toBe(true);
      expect(saved.executionArn).toBeUndefined();
      expect(saved.status).toBe('FAILED');
      expect(saved.failureKind).toBe(executionStatus);
      expect(saved.failureReason).toBeTruthy();
      expect(saved.currentTaskToken).toBeUndefined();
    },
  );

  it('does not overwrite COMPLETED when a failure terminal event arrives', async () => {
    const repo = new FakeStoryRepository();
    const story = submitStory();
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    story.bindExecution(arn);
    story.complete(`stories/${story.storyId}/final.txt`);
    await repo.createStory(story);

    const useCase = new ClearExecutionUseCase(repo);
    const output = await useCase.execute({
      storyId: story.storyId,
      executionArn: arn,
      executionStatus: 'FAILED',
    });

    const saved = await repo.getStory(story.storyId);
    expect(output.cleared).toBe(true);
    expect(saved.executionArn).toBeUndefined();
    expect(saved.status).toBe('COMPLETED');
    expect(saved.failureKind).toBeUndefined();
  });
});
