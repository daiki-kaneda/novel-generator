import { GenerateChapterUseCase } from '../../src/application/use-cases/GenerateChapterUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Chapter } from '../../src/domain/entities/Chapter';
import { FakeStoryRepository, FakeChapterContentStorage, FakeNovelTextGenerator } from './support/fakes';

describe('GenerateChapterUseCase', () => {
  it('passes the previous chapter summary as implicit context, not the full text', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-1';

    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'summary',
        theme: 'theme',
        characters: 'characters',
        chapters: [
          { index: 1, title: 'Chapter 1', outline: 'outline 1' },
          { index: 2, title: 'Chapter 2', outline: 'outline 2' },
        ],
      }),
    );
    await repo.initializeChapters(storyId, [
      Chapter.restore({
        index: 1,
        title: 'Chapter 1',
        outline: 'outline 1',
        status: 'DONE',
        s3Key: 'stories/story-1/chapters/1.txt',
        summaryKeyPoints: 'the hero found the sword',
      }),
      Chapter.fromOutline({ index: 2, title: 'Chapter 2', outline: 'outline 2' }),
    ]);

    let capturedPreviousSummary: string | undefined;
    generator.generateChapterText = async (input) => {
      capturedPreviousSummary = input.previousChapterSummary;
      return 'generated chapter 2 text';
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 2 });

    expect(capturedPreviousSummary).toBe('the hero found the sword');

    const chapter2 = await repo.getChapter(storyId, 2);
    expect(chapter2.isDone()).toBe(true);
    expect(chapter2.summaryKeyPoints).toBe(generator.summarizeChapterResult);
    await expect(storage.getChapterText(storyId, chapter2.s3Key as string)).resolves.toBe(
      'generated chapter 2 text',
    );
  });

  it('does not pass a previous chapter summary for the first chapter', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-2';

    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'summary',
        theme: 'theme',
        characters: 'characters',
        chapters: [{ index: 1, title: 'Chapter 1', outline: 'outline 1' }],
      }),
    );
    await repo.initializeChapters(storyId, [
      Chapter.fromOutline({ index: 1, title: 'Chapter 1', outline: 'outline 1' }),
    ]);

    let capturedPreviousSummary: string | undefined = 'not-set';
    generator.generateChapterText = async (input) => {
      capturedPreviousSummary = input.previousChapterSummary;
      return 'generated chapter 1 text';
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 1 });

    expect(capturedPreviousSummary).toBeUndefined();
  });
});
