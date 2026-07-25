import { DecideApprovalUseCase } from '../../src/application/use-cases/DecideApprovalUseCase';
import { ValidationError } from '../../src/domain/errors/DomainErrors';
import { Story } from '../../src/domain/entities/Story';
import { ApprovalStage } from '../../src/domain/value-objects/ApprovalDecision';
import { FakeStoryRepository, FakeApprovalGateway } from './support/fakes';

async function buildAwaitingStory(
  repo: FakeStoryRepository,
  stage: ApprovalStage,
  chapterIndex?: number,
): Promise<Story> {
  const story = Story.submit({
    overview: 'overview',
    theme: 'theme',
    characters: 'characters',
    userEmail: 'user@example.com',
    requirePlanApproval: true,
    requireChapterApproval: false,
    length: 'short',
  });
  story.awaitApproval(stage, 'task-token', chapterIndex);
  await repo.createStory(story);
  return story;
}

describe('DecideApprovalUseCase', () => {
  it('sends an approval decision and clears the taskToken', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'plan');
    const useCase = new DecideApprovalUseCase(repo, gateway);

    await useCase.execute({ storyId: story.storyId, expectedStage: 'plan', approved: true });

    expect(gateway.sentDecisions).toHaveLength(1);
    expect(gateway.sentDecisions[0].taskToken).toBe('task-token');
    expect(gateway.sentDecisions[0].decision.approved).toBe(true);

    const updated = await repo.getStory(story.storyId);
    expect(updated.currentTaskToken).toBeUndefined();
    expect(updated.taskStage).toBeUndefined();
  });

  it('sends a rejection decision including the feedback', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'final');
    const useCase = new DecideApprovalUseCase(repo, gateway);

    await useCase.execute({
      storyId: story.storyId,
      expectedStage: 'final',
      approved: false,
      feedback: 'Please change the ending',
    });

    expect(gateway.sentDecisions[0].decision.approved).toBe(false);
    expect(gateway.sentDecisions[0].decision.feedback).toBe('Please change the ending');
  });

  it('throws a ValidationError when the story is not awaiting the expected stage', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'plan');
    const useCase = new DecideApprovalUseCase(repo, gateway);

    await expect(
      useCase.execute({ storyId: story.storyId, expectedStage: 'final', approved: true }),
    ).rejects.toThrow(ValidationError);

    expect(gateway.sentDecisions).toHaveLength(0);
  });

  it('accepts a chapter approval decision for the awaited chapter index', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'chapter', 2);
    const useCase = new DecideApprovalUseCase(repo, gateway);

    await useCase.execute({
      storyId: story.storyId,
      expectedStage: 'chapter',
      approved: true,
      chapterIndex: 2,
    });

    expect(gateway.sentDecisions).toHaveLength(1);
    const updated = await repo.getStory(story.storyId);
    expect(updated.currentChapterIndex).toBeUndefined();
  });

  it('rejects a chapter decision when the chapter index does not match', async () => {
    const repo = new FakeStoryRepository();
    const gateway = new FakeApprovalGateway();
    const story = await buildAwaitingStory(repo, 'chapter', 2);
    const useCase = new DecideApprovalUseCase(repo, gateway);

    await expect(
      useCase.execute({
        storyId: story.storyId,
        expectedStage: 'chapter',
        approved: true,
        chapterIndex: 3,
      }),
    ).rejects.toThrow(ValidationError);

    expect(gateway.sentDecisions).toHaveLength(0);
  });
});
