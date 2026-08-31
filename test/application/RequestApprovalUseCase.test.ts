import { RequestApprovalUseCase } from '../../src/application/use-cases/RequestApprovalUseCase';
import { Story } from '../../src/domain/entities/Story';
import { FakeNotificationSender, FakeStoryRepository } from './support/fakes';

function submitStory() {
  return Story.submit(
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
}

describe('RequestApprovalUseCase', () => {
  it('persists the token and emails a link to the story page', async () => {
    const repo = new FakeStoryRepository();
    const notifier = new FakeNotificationSender();
    const story = submitStory();
    await repo.createStory(story);

    const useCase = new RequestApprovalUseCase(repo, notifier, 'https://d111.cloudfront.net/');
    await useCase.execute({
      storyId: story.storyId,
      stage: 'plan',
      taskToken: 'token-plan',
    });

    const saved = await repo.getStory(story.storyId);
    expect(saved.status).toBe('AWAITING_PLAN_APPROVAL');
    expect(saved.currentTaskToken).toBe('token-plan');
    expect(notifier.sentApprovalEmails).toEqual([
      {
        toEmail: 'user@example.com',
        storyId: story.storyId,
        storyPageUrl: `https://d111.cloudfront.net/stories/${story.storyId}`,
        stage: 'plan',
        chapterIndex: undefined,
      },
    ]);
  });

  it('includes chapterIndex in the approval email', async () => {
    const repo = new FakeStoryRepository();
    const notifier = new FakeNotificationSender();
    const story = submitStory();
    await repo.createStory(story);

    const useCase = new RequestApprovalUseCase(repo, notifier, 'https://d111.cloudfront.net');
    await useCase.execute({
      storyId: story.storyId,
      stage: 'chapter',
      taskToken: 'token-ch',
      chapterIndex: 3,
    });

    expect(notifier.sentApprovalEmails[0]?.chapterIndex).toBe(3);
    expect(notifier.sentApprovalEmails[0]?.storyPageUrl).toBe(
      `https://d111.cloudfront.net/stories/${story.storyId}`,
    );
  });

  it('persists recovery purpose and emails a generation-failure notice', async () => {
    const repo = new FakeStoryRepository();
    const notifier = new FakeNotificationSender();
    const story = submitStory();
    await repo.createStory(story);

    const useCase = new RequestApprovalUseCase(repo, notifier, 'https://d111.cloudfront.net');
    await useCase.execute({
      storyId: story.storyId,
      stage: 'chapter',
      taskToken: 'token-recovery',
      chapterIndex: 2,
      purpose: 'recovery',
    });

    const saved = await repo.getStory(story.storyId);
    expect(saved.status).toBe('AWAITING_CHAPTER_RECOVERY');
    expect(saved.approvalPurpose).toBe('recovery');
    expect(notifier.sentApprovalEmails[0]?.purpose).toBe('recovery');
    expect(notifier.sentApprovalEmails[0]?.chapterIndex).toBe(2);
  });

  it('does not send email when FRONTEND_BASE_URL is missing', async () => {
    const repo = new FakeStoryRepository();
    const notifier = new FakeNotificationSender();
    const story = submitStory();
    await repo.createStory(story);

    const useCase = new RequestApprovalUseCase(repo, notifier);
    await useCase.execute({
      storyId: story.storyId,
      stage: 'metadata',
      taskToken: 'token-meta',
    });

    const saved = await repo.getStory(story.storyId);
    expect(saved.status).toBe('AWAITING_METADATA_APPROVAL');
    expect(notifier.sentApprovalEmails).toHaveLength(0);
  });

  it('keeps the story awaiting approval when email sending fails', async () => {
    const repo = new FakeStoryRepository();
    const notifier = new FakeNotificationSender();
    notifier.approvalError = new Error('SES unavailable');
    const story = submitStory();
    await repo.createStory(story);

    const useCase = new RequestApprovalUseCase(repo, notifier, 'https://d111.cloudfront.net');
    await expect(
      useCase.execute({
        storyId: story.storyId,
        stage: 'final',
        taskToken: 'token-final',
      }),
    ).resolves.toBeUndefined();

    const saved = await repo.getStory(story.storyId);
    expect(saved.status).toBe('AWAITING_FINAL_APPROVAL');
    expect(saved.currentTaskToken).toBe('token-final');
    expect(notifier.sentApprovalEmails).toHaveLength(0);
  });
});
