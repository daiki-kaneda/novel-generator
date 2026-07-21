import { CreateRevisionPlanUseCase } from '../../src/application/use-cases/CreateRevisionPlanUseCase';
import { Chapter } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import { FakeStoryRepository, FakeNovelTextGenerator } from './support/fakes';

async function buildStoryWithChapters(repo: FakeStoryRepository): Promise<Story> {
  const story = Story.submit({
    overview: 'overview',
    theme: 'theme',
    characters: 'characters',
    userEmail: 'user@example.com',
  });
  await repo.createStory(story);
  await repo.initializeChapters(story.storyId, [
    Chapter.fromOutline({ index: 1, title: 'Chapter 1', outline: 'outline 1' }),
    Chapter.fromOutline({ index: 2, title: 'Chapter 2', outline: 'outline 2' }),
  ]);
  for (const index of [1, 2]) {
    const chapter = await repo.getChapter(story.storyId, index);
    chapter.complete(`stories/${story.storyId}/chapters/${index}.txt`, `summary ${index}`);
    await repo.saveChapter(story.storyId, chapter);
  }
  return story;
}

describe('CreateRevisionPlanUseCase', () => {
  it('marks only the chapters proposed by the LLM as needing revision', async () => {
    const repo = new FakeStoryRepository();
    const generator = new FakeNovelTextGenerator();
    const story = await buildStoryWithChapters(repo);
    generator.proposeRevisionPlanResult = [
      { chapterIndex: 2, instruction: 'Make the ending happier' },
    ];

    const useCase = new CreateRevisionPlanUseCase(repo, generator);
    const result = await useCase.execute({
      storyId: story.storyId,
      feedback: 'The ending felt too sad',
    });

    expect(result.chapterIndexes).toEqual([2]);

    const revisedChapter = await repo.getChapter(story.storyId, 2);
    expect(revisedChapter.status).toBe('PENDING');
    expect(revisedChapter.revisionInstruction).toBe('Make the ending happier');

    const untouchedChapter = await repo.getChapter(story.storyId, 1);
    expect(untouchedChapter.status).toBe('DONE');

    const updatedStory = await repo.getStory(story.storyId);
    expect(updatedStory.status).toBe('REVISING');
  });

  it('falls back to the last chapter when the LLM proposes nothing usable', async () => {
    const repo = new FakeStoryRepository();
    const generator = new FakeNovelTextGenerator();
    const story = await buildStoryWithChapters(repo);
    generator.proposeRevisionPlanResult = [
      { chapterIndex: 99, instruction: 'a chapter that does not exist' },
    ];

    const useCase = new CreateRevisionPlanUseCase(repo, generator);
    const result = await useCase.execute({ storyId: story.storyId, feedback: 'fix the story' });

    expect(result.chapterIndexes).toEqual([2]);
    const chapter2 = await repo.getChapter(story.storyId, 2);
    expect(chapter2.revisionInstruction).toBe('fix the story');
  });
});
