import { GenerateMetadataUseCase } from '../../src/application/use-cases/GenerateMetadataUseCase';
import { Story } from '../../src/domain/entities/Story';
import { FakeStoryRepository, FakeNovelTextGenerator } from './support/fakes';

describe('GenerateMetadataUseCase', () => {
  it('generates metadata from the request seed and persists it', async () => {
    const repo = new FakeStoryRepository();
    const generator = new FakeNovelTextGenerator();
    const story = Story.submit(
      {
        overview: 'seed overview',
        theme: 'seed theme',
        characters: 'seed characters',
        setting: '砂漠の都市国家',
        userEmail: 'user@example.com',
        requireMetadataApproval: true,
        requirePlanApproval: true,
        requireChapterApproval: false,
        requireFinalApproval: true,
        length: 'short',
      },
      'owner-1',
    );
    await repo.createStory(story);

    let capturedSetting: string | undefined;
    generator.generateMetadata = async (input) => {
      capturedSetting = input.setting;
      expect(input.overview).toBe('seed overview');
      return generator.generateMetadataResult;
    };

    const useCase = new GenerateMetadataUseCase(repo, generator);
    const result = await useCase.execute({ storyId: story.storyId });

    expect(capturedSetting).toBe('砂漠の都市国家');
    expect(result.requireMetadataApproval).toBe(true);
    expect(result.requirePlanApproval).toBe(true);
    expect(result.requireChapterApproval).toBe(false);
    expect(result.requireFinalApproval).toBe(true);

    const stored = await repo.getMetadata(story.storyId);
    expect(stored.theme).toBe('fake theme');
    expect(stored.characters).toHaveLength(1);

    const updatedStory = await repo.getStory(story.storyId);
    expect(updatedStory.status).toBe('METADATA_GENERATING');
    // シードは上書きされない
    expect(updatedStory.request.overview).toBe('seed overview');
    expect(updatedStory.request.setting).toBe('砂漠の都市国家');
  });

  it('records rejection feedback into revision history on regenerate', async () => {
    const repo = new FakeStoryRepository();
    const generator = new FakeNovelTextGenerator();
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
    await repo.createStory(story);

    const useCase = new GenerateMetadataUseCase(repo, generator);
    await useCase.execute({ storyId: story.storyId });
    await useCase.execute({ storyId: story.storyId, feedback: '地理をもっと詳しく' });

    const stored = await repo.getMetadata(story.storyId);
    expect(stored.revisionHistory).toEqual(['地理をもっと詳しく']);
  });
});
