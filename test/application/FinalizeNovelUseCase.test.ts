import { FinalizeNovelUseCase } from '../../src/application/use-cases/FinalizeNovelUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Chapter } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import {
  FakeStoryRepository,
  FakeChapterContentStorage,
  FakeNotificationSender,
} from './support/fakes';

describe('FinalizeNovelUseCase', () => {
  it('combines all chapters, saves the final text, and notifies the user', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const notifier = new FakeNotificationSender();

    const story = Story.submit({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      length: 'short',
    });
    await repo.createStory(story);
    await repo.savePlan(
      story.storyId,
      Plan.create({
        summary: 'A story about a hero.',
        theme: 'theme',
        characters: 'characters',
        chapters: [{ index: 1, title: 'Chapter 1', outline: 'outline 1' }],
      }),
    );

    const chapterKey = await storage.saveChapterText(story.storyId, 1, 'Chapter 1 body text');
    await repo.initializeChapters(story.storyId, [
      Chapter.restore({
        index: 1,
        title: 'Chapter 1',
        outline: 'outline 1',
        status: 'DONE',
        s3Key: chapterKey,
        summaryKeyPoints: 'the hero wins',
      }),
    ]);

    const useCase = new FinalizeNovelUseCase(repo, storage, notifier, 3600);
    const result = await useCase.execute({ storyId: story.storyId });

    expect(result.finalUrl).toContain('final.txt');
    expect(notifier.sentEmails).toHaveLength(1);
    expect(notifier.sentEmails[0]).toEqual({
      toEmail: 'user@example.com',
      storyId: story.storyId,
      downloadUrl: result.finalUrl,
    });

    const updatedStory = await repo.getStory(story.storyId);
    expect(updatedStory.status).toBe('COMPLETED');
    expect(updatedStory.finalUrl).toBe(result.finalUrl);
  });

  it('fails fast when a chapter has not been generated yet', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const notifier = new FakeNotificationSender();

    const story = Story.submit({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      length: 'short',
    });
    await repo.createStory(story);
    await repo.savePlan(
      story.storyId,
      Plan.create({
        summary: 'summary',
        theme: 'theme',
        characters: 'characters',
        chapters: [{ index: 1, title: 'Chapter 1', outline: 'outline 1' }],
      }),
    );
    await repo.initializeChapters(story.storyId, [
      Chapter.fromOutline({ index: 1, title: 'Chapter 1', outline: 'outline 1' }),
    ]);

    const useCase = new FinalizeNovelUseCase(repo, storage, notifier, 3600);

    await expect(useCase.execute({ storyId: story.storyId })).rejects.toThrow(
      /has not been generated yet/,
    );
    expect(notifier.sentEmails).toHaveLength(0);
  });
});
