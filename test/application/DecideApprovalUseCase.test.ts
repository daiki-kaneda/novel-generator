import { DecideApprovalUseCase } from '../../src/application/use-cases/DecideApprovalUseCase';
import {
  BudgetExceededError,
  ForbiddenError,
  ValidationError,
} from '../../src/domain/errors/DomainErrors';
import { Story } from '../../src/domain/entities/Story';
import { ApprovalStage } from '../../src/domain/value-objects/ApprovalDecision';
import {
  FakeStoryRepository,
  FakeApprovalGateway,
  FakeUsageAccountRepository,
} from './support/fakes';

async function buildAwaitingStory(
  repo: FakeStoryRepository,
  stage: ApprovalStage,
  chapterIndex?: number,
): Promise<Story> {
  const story = Story.submit(
    {
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    },
    'owner-1',
  );
  story.awaitApproval(stage, 'task-token', chapterIndex);
  await repo.createStory(story);
  return story;
}

describe('DecideApprovalUseCase', () => {
  it('sends an approval decision and clears the taskToken', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'plan');
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await useCase.execute({
      storyId: story.storyId,
      callerId: story.ownerId,
      expectedStage: 'plan',
      approved: true,
    });

    expect(gateway.sentDecisions).toHaveLength(1);
    expect(gateway.sentDecisions[0].taskToken).toBe('task-token');
    expect(gateway.sentDecisions[0].decision.approved).toBe(true);

    const updated = await repo.getStory(story.storyId);
    expect(updated.currentTaskToken).toBeUndefined();
    expect(updated.taskStage).toBeUndefined();
  });

  it('accepts a metadata approval decision', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'metadata');
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await useCase.execute({
      storyId: story.storyId,
      callerId: story.ownerId,
      expectedStage: 'metadata',
      approved: true,
    });

    expect(gateway.sentDecisions).toHaveLength(1);
    const updated = await repo.getStory(story.storyId);
    expect(updated.taskStage).toBeUndefined();
  });

  it('sends a rejection decision including the feedback', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'final');
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await useCase.execute({
      storyId: story.storyId,
      callerId: story.ownerId,
      expectedStage: 'final',
      approved: false,
      feedback: 'Please change the ending',
    });

    expect(gateway.sentDecisions[0].decision.approved).toBe(false);
    expect(gateway.sentDecisions[0].decision.feedback).toBe('Please change the ending');
    expect(gateway.sentDecisions[0].decision.rewriteFromChapterIndex).toBe(1);
  });

  it('passes rewriteFromChapterIndex on final rejection when provided', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'final');
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await useCase.execute({
      storyId: story.storyId,
      callerId: story.ownerId,
      expectedStage: 'final',
      approved: false,
      feedback: 'Rewrite from chapter 3',
      rewriteFromChapterIndex: 3,
    });

    expect(gateway.sentDecisions[0].decision.rewriteFromChapterIndex).toBe(3);
  });

  it('throws a ValidationError when the story is not awaiting the expected stage', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'plan');
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        callerId: story.ownerId,
        expectedStage: 'final',
        approved: true,
      }),
    ).rejects.toThrow(ValidationError);

    expect(gateway.sentDecisions).toHaveLength(0);
  });

  it('accepts a chapter approval decision for the awaited chapter index', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'chapter', 2);
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await useCase.execute({
      storyId: story.storyId,
      callerId: story.ownerId,
      expectedStage: 'chapter',
      approved: true,
      chapterIndex: 2,
    });

    expect(gateway.sentDecisions).toHaveLength(1);
    const updated = await repo.getStory(story.storyId);
    expect(updated.currentChapterIndex).toBeUndefined();
  });

  it('rejects approving a failed chapter during recovery so it cannot stay pending', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'chapter', 2);
    story.awaitApproval('chapter', 'task-token', 2, 'recovery');
    await repo.saveStory(story);
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        callerId: story.ownerId,
        expectedStage: 'chapter',
        approved: true,
        chapterIndex: 2,
      }),
    ).rejects.toThrow(ValidationError);

    expect(gateway.sentDecisions).toHaveLength(0);
    const updated = await repo.getStory(story.storyId);
    expect(updated.currentTaskToken).toBe('task-token');
    expect(updated.approvalPurpose).toBe('recovery');
  });

  it('sends a recovery retry as a rejection with feedback', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'chapter', 2);
    story.awaitApproval('chapter', 'task-token', 2, 'recovery');
    await repo.saveStory(story);
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await useCase.execute({
      storyId: story.storyId,
      callerId: story.ownerId,
      expectedStage: 'chapter',
      approved: false,
      feedback: '剣を失った設定と矛盾しない展開にしてほしい',
      chapterIndex: 2,
    });

    expect(gateway.sentDecisions).toHaveLength(1);
    expect(gateway.sentDecisions[0].decision.approved).toBe(false);
    expect(gateway.sentDecisions[0].decision.feedback).toBe(
      '剣を失った設定と矛盾しない展開にしてほしい',
    );
  });

  it('aborts chapter recovery by failing the wait token', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'chapter', 2);
    story.awaitApproval('chapter', 'task-token', 2, 'recovery');
    await repo.saveStory(story);
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await useCase.execute({
      storyId: story.storyId,
      callerId: story.ownerId,
      expectedStage: 'chapter',
      approved: false,
      abort: true,
      chapterIndex: 2,
    });

    expect(gateway.sentDecisions).toHaveLength(0);
    expect(gateway.sentFailures).toEqual([
      {
        taskToken: 'task-token',
        error: 'ChapterRecoveryAborted',
        cause: 'User aborted chapter recovery',
      },
    ]);
    const updated = await repo.getStory(story.storyId);
    expect(updated.currentTaskToken).toBeUndefined();
  });

  it('rejects a chapter decision when the chapter index does not match', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'chapter', 2);
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        callerId: story.ownerId,
        expectedStage: 'chapter',
        approved: true,
        chapterIndex: 3,
      }),
    ).rejects.toThrow(ValidationError);

    expect(gateway.sentDecisions).toHaveLength(0);
  });

  it('rejects when the story owner has exhausted their monthly usage budget', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const usageAccountRepository = new FakeUsageAccountRepository();
    const story = await buildAwaitingStory(repo, 'plan');
    usageAccountRepository.seedCurrentMonthUsage(story.request.userEmail, { totalCostUsd: 2 });
    const useCase = new DecideApprovalUseCase(repo, gateway, usageAccountRepository);

    await expect(
      useCase.execute({
        storyId: story.storyId,
        callerId: story.ownerId,
        expectedStage: 'plan',
        approved: true,
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(gateway.sentDecisions).toHaveLength(0);
  });

  it('rejects when the caller is not the story owner', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'plan');
    const useCase = new DecideApprovalUseCase(repo, gateway, new FakeUsageAccountRepository());

    await expect(
      useCase.execute({
        storyId: story.storyId,
        callerId: 'someone-else',
        expectedStage: 'plan',
        approved: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(gateway.sentDecisions).toHaveLength(0);
  });
});
