import { GenerateChapterUseCase } from '../../src/application/use-cases/GenerateChapterUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Chapter } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import { StoryMetadata } from '../../src/domain/entities/StoryMetadata';
import { FakeStoryRepository, FakeChapterContentStorage, FakeNovelTextGenerator } from './support/fakes';

function sampleMetadata(): StoryMetadata {
  return StoryMetadata.create({
    overview: 'enriched overview',
    theme: 'enriched theme',
    tone: '緊張感のある文調',
    characters: [
      {
        name: 'Hero',
        role: '主人公',
        personality: '勇敢',
        background: '田舎育ち',
        goals: '平和を守る',
        relationships: '導師の弟子',
        appearance: '短髪で旅装の少年',
      },
    ],
    world: {
      geography: '北方の王国と南の港町',
      timePeriod: '中世風ファンタジー',
    },
    timelineRules: '章間は数日以内',
    consistencyNotes: '魔法は稀少',
  });
}

async function seedStory(repo: FakeStoryRepository, storyId: string): Promise<void> {
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
  // storyId をテスト固定値に合わせるため restore で差し替える
  const restored = Story.restore({
    ...story.toProps(),
    storyId,
  });
  await repo.createStory(restored);
  await repo.saveMetadata(storyId, sampleMetadata());
}

describe('GenerateChapterUseCase', () => {
  it('passes the previous chapter summary as implicit context, not the full text', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-1';
    await seedStory(repo, storyId);

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

  it('passes full metadata and the entire plan to chapter generation', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-full-context';
    await seedStory(repo, storyId);

    const chapters = [
      { index: 1, title: 'Chapter 1', outline: 'outline 1' },
      { index: 2, title: 'Chapter 2', outline: 'outline 2' },
    ];
    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'plan summary',
        theme: 'plan theme',
        characters: 'plan characters',
        chapters,
      }),
    );
    await repo.initializeChapters(
      storyId,
      chapters.map((outline) => Chapter.fromOutline(outline)),
    );

    let capturedMetadataTheme: string | undefined;
    let capturedPlanChapterCount = 0;
    generator.generateChapterText = async (input) => {
      capturedMetadataTheme = input.metadata.theme;
      capturedPlanChapterCount = input.plan.chapters.length;
      expect(input.plan.summary).toBe('plan summary');
      expect(input.chapterOutline.index).toBe(1);
      expect(input.metadata.world.geography).toContain('北方');
      return 'generated chapter 1 text';
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 1 });

    expect(capturedMetadataTheme).toBe('enriched theme');
    expect(capturedPlanChapterCount).toBe(2);
  });

  it('does not pass a previous chapter summary for the first chapter', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-2';
    await seedStory(repo, storyId);

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

  it('applies revisionFeedback before regenerating the chapter', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-3';
    await seedStory(repo, storyId);

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

    let capturedInstruction: string | undefined;
    generator.generateChapterText = async (input) => {
      capturedInstruction = input.revisionInstruction;
      return 'revised chapter text';
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({
      storyId,
      chapterIndex: 1,
      revisionFeedback: 'もっと緊張感を出して',
    });

    expect(capturedInstruction).toBe('もっと緊張感を出して');
  });
});
