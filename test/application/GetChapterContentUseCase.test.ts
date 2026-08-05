import { GetChapterContentUseCase } from '../../src/application/use-cases/GetChapterContentUseCase';
import { Story } from '../../src/domain/entities/Story';
import { Chapter } from '../../src/domain/entities/Chapter';
import { NotFoundError } from '../../src/domain/errors/DomainErrors';
import { FakeStoryRepository, FakeChapterContentStorage } from './support/fakes';

describe('GetChapterContentUseCase', () => {
  it('returns a presigned URL for a generated chapter', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const story = Story.submit({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    });
    await repo.createStory(story);

    const s3Key = await storage.saveChapterText(story.storyId, 1, 'chapter body');
    await repo.initializeChapters(story.storyId, [
      Chapter.restore({
        index: 1,
        title: 'Chapter 1',
        outline: 'outline',
        status: 'DONE',
        s3Key,
      }),
    ]);

    const useCase = new GetChapterContentUseCase(repo, storage, 3600);
    const result = await useCase.execute({ storyId: story.storyId, chapterIndex: 1 });

    expect(result.title).toBe('Chapter 1');
    expect(result.contentUrl).toContain(s3Key);
    expect(result.contentUrl).toContain('expires=3600');
  });

  it('throws NotFoundError when the chapter has no content yet', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const story = Story.submit({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    });
    await repo.createStory(story);
    await repo.initializeChapters(story.storyId, [
      Chapter.fromOutline({ index: 1, title: 'Chapter 1', outline: 'outline' }),
    ]);

    const useCase = new GetChapterContentUseCase(repo, storage, 3600);
    await expect(
      useCase.execute({ storyId: story.storyId, chapterIndex: 1 }),
    ).rejects.toThrow(NotFoundError);
  });
});
