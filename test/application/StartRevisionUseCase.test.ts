import { StartRevisionUseCase } from '../../src/application/use-cases/StartRevisionUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Story } from '../../src/domain/entities/Story';
import { BudgetExceededError, ValidationError } from '../../src/domain/errors/DomainErrors';
import {
  FakeStoryRepository,
  FakeUsageAccountRepository,
  FakeWorkflowStarter,
  SAMPLE_PLAN_CHARACTERS,
} from './support/fakes';

async function buildStoryWithPlan(
  repo: FakeStoryRepository,
  options?: { bindArn?: string; status?: 'COMPLETED' | 'AWAITING_FINAL_APPROVAL' },
): Promise<Story> {
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
  if (options?.status === 'AWAITING_FINAL_APPROVAL') {
    story.moveTo('AWAITING_FINAL_APPROVAL');
  } else {
    story.complete(`stories/${story.storyId}/final.txt`);
  }
  if (options?.bindArn) {
    story.bindExecution(options.bindArn);
  }
  await repo.createStory(story);
  await repo.savePlan(
    story.storyId,
    Plan.create({
      summary: 's',
      theme: 't',
      characters: SAMPLE_PLAN_CHARACTERS,
      chapters: [
        { index: 1, title: 'C1', outline: 'o1' },
        { index: 2, title: 'C2', outline: 'o2' },
        { index: 3, title: 'C3', outline: 'o3' },
      ],
    }),
  );
  return story;
}

describe('StartRevisionUseCase', () => {
  it('starts the workflow with revision fields and binds executionArn', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = await buildStoryWithPlan(repo);
  const useCase = new StartRevisionUseCase(repo, starter, new FakeUsageAccountRepository());

  const output = await useCase.execute({
      storyId: story.storyId,
      rewriteFromChapterIndex: 2,
      feedback: 'Fix the middle act',
    });

    expect(output.executionArn).toBe(starter.nextExecutionArn);
    expect(output.rewriteFromChapterIndex).toBe(2);
    expect(starter.started).toEqual([
      {
        storyId: story.storyId,
        feedback: 'Fix the middle act',
        rewriteFromChapterIndex: 2,
      },
    ]);

    const updated = await repo.getStory(story.storyId);
    expect(updated.status).toBe('CHAPTERS_GENERATING');
    expect(updated.executionArn).toBe(starter.nextExecutionArn);
  });

  it('allows recovery from AWAITING_FINAL_APPROVAL when no execution lock', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = await buildStoryWithPlan(repo, { status: 'AWAITING_FINAL_APPROVAL' });
    const useCase = new StartRevisionUseCase(repo, starter, new FakeUsageAccountRepository());

    const output = await useCase.execute({
      storyId: story.storyId,
      rewriteFromChapterIndex: 3,
      feedback: 'Regenerate unfinished chapter',
    });

    expect(output.executionArn).toBe(starter.nextExecutionArn);
    expect((await repo.getStory(story.storyId)).status).toBe('CHAPTERS_GENERATING');
  });

  it('rejects when a running execution lock is present', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const lockedArn = 'arn:aws:states:us-east-1:123:execution:novel:locked';
    const story = await buildStoryWithPlan(repo, { bindArn: lockedArn });
    starter.executionStatuses.set(lockedArn, 'RUNNING');
    const useCase = new StartRevisionUseCase(repo, starter, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 1,
        feedback: 'redo',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(starter.started).toHaveLength(0);
  });

  it('clears a stale lock and starts revision', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const staleArn = 'arn:aws:states:us-east-1:123:execution:novel:stale';
    const story = await buildStoryWithPlan(repo, {
      status: 'AWAITING_FINAL_APPROVAL',
      bindArn: staleArn,
    });
    starter.executionStatuses.set(staleArn, 'FAILED');
    starter.nextExecutionArn = 'arn:aws:states:us-east-1:123:execution:novel:new';
    const useCase = new StartRevisionUseCase(repo, starter, new FakeUsageAccountRepository());

    const output = await useCase.execute({
      storyId: story.storyId,
      rewriteFromChapterIndex: 2,
      feedback: 'recover after finalize failure',
    });

    expect(output.executionArn).toBe(starter.nextExecutionArn);
    expect((await repo.getStory(story.storyId)).executionArn).toBe(starter.nextExecutionArn);
  });

  it('rejects when plan is missing', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = Story.submit({
      overview: 'o',
      theme: 't',
      characters: 'c',
      userEmail: 'u@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    });
    story.complete(`stories/${story.storyId}/final.txt`);
    await repo.createStory(story);
    const useCase = new StartRevisionUseCase(repo, starter, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 1,
        feedback: 'redo',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(starter.started).toHaveLength(0);
  });

  it('rejects empty feedback', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = await buildStoryWithPlan(repo);
    const useCase = new StartRevisionUseCase(repo, starter, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 1,
        feedback: '   ',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(starter.started).toHaveLength(0);
  });

  it('rejects rewriteFromChapterIndex beyond plan chapters', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = await buildStoryWithPlan(repo);
    const useCase = new StartRevisionUseCase(repo, starter, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 9,
        feedback: 'too far',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(starter.started).toHaveLength(0);
  });

  it('rejects when the story owner has exhausted their monthly usage budget', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const usageAccountRepository = new FakeUsageAccountRepository();
    const story = await buildStoryWithPlan(repo);
    usageAccountRepository.seedCurrentMonthUsage(story.request.userEmail, { totalCostUsd: 2 });
    const useCase = new StartRevisionUseCase(repo, starter, usageAccountRepository);

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 1,
        feedback: 'redo',
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(starter.started).toHaveLength(0);
  });
});
