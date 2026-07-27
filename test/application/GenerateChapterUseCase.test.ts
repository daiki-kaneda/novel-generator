import { GenerateChapterUseCase } from '../../src/application/use-cases/GenerateChapterUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Chapter, ChapterOutline } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import { StoryMetadata } from '../../src/domain/entities/StoryMetadata';
import {
  FakeStoryRepository,
  FakeChapterContentStorage,
  FakeNovelTextGenerator,
  SAMPLE_PLAN_CHARACTERS,
} from './support/fakes';
import { RevisePlanInput } from '../../src/application/ports/NovelTextGenerator';

function sampleMetadata(): StoryMetadata {
  return StoryMetadata.create({
    overview: 'enriched overview',
    theme: 'enriched theme',
    tone: '緊張感のある文調',
    characters: SAMPLE_PLAN_CHARACTERS.map((c) => ({ ...c })),
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
        characters: SAMPLE_PLAN_CHARACTERS,
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

  it('masks future chapters and uses plan characters (not metadata characters) when generating', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-full-context';
    await seedStory(repo, storyId);

    const planCharacters = [
      {
        name: 'Plan Hero',
        role: '主人公',
        personality: '慎重',
        background: '都市育ち',
        goals: '真実を知る',
        relationships: '孤独',
      },
    ];
    const chapters = [
      { index: 1, title: 'Chapter 1', outline: 'outline 1' },
      { index: 2, title: 'Chapter 2', outline: 'outline 2' },
      { index: 3, title: 'Chapter 3', outline: 'outline 3' },
    ];
    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'plan summary',
        theme: 'plan theme',
        characters: planCharacters,
        chapters,
      }),
    );
    await repo.initializeChapters(
      storyId,
      chapters.map((outline) => Chapter.fromOutline(outline)),
    );

    let capturedMetadataTheme: string | undefined;
    let capturedPlanChapterIndexes: number[] = [];
    let capturedPlanCharacterName: string | undefined;
    let metadataHasCharactersKey = true;
    generator.generateChapterText = async (input) => {
      capturedMetadataTheme = input.metadata.theme;
      capturedPlanChapterIndexes = input.plan.chapters.map((c) => c.index);
      capturedPlanCharacterName = input.plan.characters[0]?.name;
      metadataHasCharactersKey = 'characters' in input.metadata;
      expect(input.plan.summary).toBe('plan summary');
      expect(input.chapterOutline.index).toBe(1);
      expect(input.metadata.world.geography).toContain('北方');
      return 'generated chapter 1 text';
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 1 });

    expect(capturedMetadataTheme).toBe('enriched theme');
    expect(capturedPlanChapterIndexes).toEqual([1]);
    expect(capturedPlanCharacterName).toBe('Plan Hero');
    expect(metadataHasCharactersKey).toBe(false);
  });

  it('uses the latest plan outline for chapterOutline even if the chapter record is stale', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-stale-outline';
    await seedStory(repo, storyId);

    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'summary',
        theme: 'theme',
        characters: SAMPLE_PLAN_CHARACTERS,
        chapters: [
          { index: 1, title: 'Revised Title 1', outline: 'revised outline 1' },
          { index: 2, title: 'Chapter 2', outline: 'outline 2' },
        ],
      }),
    );
    await repo.initializeChapters(storyId, [
      Chapter.fromOutline({ index: 1, title: 'Old Title 1', outline: 'old outline 1' }),
      Chapter.fromOutline({ index: 2, title: 'Chapter 2', outline: 'outline 2' }),
    ]);

    let capturedTitle: string | undefined;
    let capturedOutline: string | undefined;
    generator.generateChapterText = async (input) => {
      capturedTitle = input.chapterOutline.title;
      capturedOutline = input.chapterOutline.outline;
      return 'generated chapter 1 text';
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 1 });

    expect(capturedTitle).toBe('Revised Title 1');
    expect(capturedOutline).toBe('revised outline 1');

    const chapter1 = await repo.getChapter(storyId, 1);
    expect(chapter1.title).toBe('Revised Title 1');
    expect(chapter1.outline).toBe('revised outline 1');
  });

  it('revises future plan chapters and characters after a non-final chapter completes', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-revise-plan';
    await seedStory(repo, storyId);

    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'summary',
        theme: 'theme',
        characters: SAMPLE_PLAN_CHARACTERS,
        chapters: [
          { index: 1, title: 'Chapter 1', outline: 'outline 1' },
          { index: 2, title: 'Chapter 2', outline: 'outline 2' },
          { index: 3, title: 'Chapter 3', outline: 'outline 3' },
        ],
      }),
    );
    await repo.initializeChapters(storyId, [
      Chapter.fromOutline({ index: 1, title: 'Chapter 1', outline: 'outline 1' }),
      Chapter.fromOutline({ index: 2, title: 'Chapter 2', outline: 'outline 2' }),
      Chapter.fromOutline({ index: 3, title: 'Chapter 3', outline: 'outline 3' }),
    ]);

    let reviseCalled = false;
    let capturedReviseInput: RevisePlanInput | undefined;
    generator.revisePlan = async (input) => {
      reviseCalled = true;
      capturedReviseInput = input;
      return {
        chapters: [
          { index: 2, title: 'Revised Chapter 2', outline: 'revised outline 2' },
          { index: 3, title: 'Revised Chapter 3', outline: 'revised outline 3' },
        ],
        characters: [
          {
            ...SAMPLE_PLAN_CHARACTERS[0],
            goals: '剣を手に入れた今、王国を救う',
            relationships: '導師への疑念が芽生えている',
          },
          {
            name: 'Mentor',
            role: '導師',
            personality: '謎めいた',
            background: '古の騎士',
            goals: '弟子を試練にかける',
            relationships: 'Hero の師匠',
          },
        ],
      };
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 1 });

    expect(reviseCalled).toBe(true);
    expect(capturedReviseInput?.futureChapters.map((c) => c.index)).toEqual([2, 3]);
    expect(capturedReviseInput?.completedChapter.index).toBe(1);
    expect(capturedReviseInput?.planSummary).toBe('summary');
    expect(capturedReviseInput?.planTheme).toBe('theme');
    expect(capturedReviseInput?.characters).toHaveLength(1);
    expect(capturedReviseInput?.metadata).not.toHaveProperty('characters');

    const plan = await repo.getPlan(storyId);
    expect(plan.chapters[0]).toEqual({ index: 1, title: 'Chapter 1', outline: 'outline 1' });
    expect(plan.chapters[1]).toEqual({
      index: 2,
      title: 'Revised Chapter 2',
      outline: 'revised outline 2',
    });
    expect(plan.chapters[2]).toEqual({
      index: 3,
      title: 'Revised Chapter 3',
      outline: 'revised outline 3',
    });
    expect(plan.summary).toBe('summary');
    expect(plan.theme).toBe('theme');
    expect(plan.characters).toHaveLength(2);
    expect(plan.characters[0].goals).toContain('王国を救う');
    expect(plan.characters[1].name).toBe('Mentor');

    const snapshots = await repo.listPlanSnapshots(storyId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].afterChapterIndex).toBe(1);
    expect(snapshots[0].trigger).toBe('chapter_revision');
    expect(snapshots[0].plan.characters).toHaveLength(2);
    expect(snapshots[0].plan.chapters[1].title).toBe('Revised Chapter 2');
  });

  it('does not revise the plan after the final chapter', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-final-chapter';
    await seedStory(repo, storyId);

    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'summary',
        theme: 'theme',
        characters: SAMPLE_PLAN_CHARACTERS,
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
        s3Key: 'stories/story-final-chapter/chapters/1.txt',
        summaryKeyPoints: 'summary 1',
      }),
      Chapter.fromOutline({ index: 2, title: 'Chapter 2', outline: 'outline 2' }),
    ]);

    let reviseCalled = false;
    generator.revisePlan = async (input) => {
      reviseCalled = true;
      return {
        chapters: input.futureChapters,
        characters: input.characters,
      };
    };

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 2 });

    expect(reviseCalled).toBe(false);
  });

  it('keeps the existing plan when revisePlan fails', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-revise-fail';
    await seedStory(repo, storyId);

    const originalChapters: ChapterOutline[] = [
      { index: 1, title: 'Chapter 1', outline: 'outline 1' },
      { index: 2, title: 'Chapter 2', outline: 'outline 2' },
    ];
    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'summary',
        theme: 'theme',
        characters: SAMPLE_PLAN_CHARACTERS,
        chapters: originalChapters,
      }),
    );
    await repo.initializeChapters(
      storyId,
      originalChapters.map((outline) => Chapter.fromOutline(outline)),
    );

    generator.revisePlan = async () => {
      throw new Error('bedrock revise failed');
    };

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const useCase = new GenerateChapterUseCase(repo, storage, generator);
    await expect(useCase.execute({ storyId, chapterIndex: 1 })).resolves.toBeUndefined();

    const chapter1 = await repo.getChapter(storyId, 1);
    expect(chapter1.isDone()).toBe(true);

    const plan = await repo.getPlan(storyId);
    expect(plan.chapters).toEqual(originalChapters);
    expect(plan.characters).toEqual(SAMPLE_PLAN_CHARACTERS);
    expect(warnSpy).toHaveBeenCalled();
    await expect(repo.listPlanSnapshots(storyId)).resolves.toEqual([]);

    warnSpy.mockRestore();
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
        characters: SAMPLE_PLAN_CHARACTERS,
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
        characters: SAMPLE_PLAN_CHARACTERS,
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
