import { GetFinalContentUseCase } from '../../src/application/use-cases/GetFinalContentUseCase';
import { Story } from '../../src/domain/entities/Story';
import { ValidationError } from '../../src/domain/errors/DomainErrors';
import { FakeChapterContentStorage, FakeStoryRepository } from './support/fakes';

function submitStory() {
  return Story.submit({
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
}

describe('GetFinalContentUseCase', () => {
  it('re-issues a presigned URL from the stored finalKey', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const story = submitStory();
    const finalKey = await storage.saveFinalText(story.storyId, 'final manuscript');
    story.complete(finalKey);
    await repo.createStory(story);

    const useCase = new GetFinalContentUseCase(repo, storage, 3600);
    const result = await useCase.execute({ storyId: story.storyId });

    expect(result.storyId).toBe(story.storyId);
    expect(result.contentUrl).toContain(finalKey);
    expect(result.contentUrl).toContain('expires=3600');
    expect(result.expiresInSeconds).toBe(3600);
  });

  it('falls back to the deterministic key for a legacy completed story', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const story = Story.restore({
      storyId: '00000000-0000-4000-8000-000000000088',
      status: 'COMPLETED',
      request: submitStory().request,
      finalUrl: 'https://example.com/expired-presigned',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    await repo.createStory(story);

    const useCase = new GetFinalContentUseCase(repo, storage, 120);
    const result = await useCase.execute({ storyId: story.storyId });

    expect(result.contentUrl).toContain('stories/00000000-0000-4000-8000-000000000088/final.txt');
    expect(result.expiresInSeconds).toBe(120);
  });

  it('rejects when the story is not completed', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const story = submitStory();
    story.moveTo('CHAPTERS_GENERATING');
    await repo.createStory(story);

    const useCase = new GetFinalContentUseCase(repo, storage, 3600);
    await expect(useCase.execute({ storyId: story.storyId })).rejects.toBeInstanceOf(ValidationError);
  });
});
