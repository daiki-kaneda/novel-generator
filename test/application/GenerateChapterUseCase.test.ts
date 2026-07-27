import { GenerateChapterUseCase } from '../../src/application/use-cases/GenerateChapterUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Chapter } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import { StoryMetadata } from '../../src/domain/entities/StoryMetadata';
import { ContradictionDetectedError } from '../../src/domain/errors/DomainErrors';
import {
  FakeStoryRepository,
  FakeChapterContentStorage,
  FakeNovelTextGenerator,
  FakeWorldStateRepository,
  SAMPLE_PLAN_CHARACTERS,
} from './support/fakes';
import { RealignFuturePlanInput } from '../../src/application/ports/NovelTextGenerator';
import { AtomicFact } from '../../src/domain/entities/WorldState';

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
  const restored = Story.restore({
    ...story.toProps(),
    storyId,
  });
  await repo.createStory(restored);
  await repo.saveMetadata(storyId, sampleMetadata());
}

function createUseCase(
  repo: FakeStoryRepository,
  storage: FakeChapterContentStorage,
  generator: FakeNovelTextGenerator,
  world: FakeWorldStateRepository = new FakeWorldStateRepository(),
): GenerateChapterUseCase {
  return new GenerateChapterUseCase(repo, storage, generator, world);
}

describe('GenerateChapterUseCase', () => {
  it('passes active facts and previous scene summary instead of relying on summary alone', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const world = new FakeWorldStateRepository();
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

    const priorFact: AtomicFact = {
      factId: 'fact-c0001-001',
      subject: 'Hero',
      predicate: 'holds',
      object: 'sword',
      entityIds: ['char-hero'],
      validFromChapter: 1,
      sourceChapterIndex: 1,
    };
    await world.appendFacts(storyId, [priorFact]);

    let capturedSceneSummary: string | undefined;
    let capturedFacts: unknown;
    generator.generateChapterText = async (input) => {
      capturedSceneSummary = input.previousSceneSummary;
      capturedFacts = input.activeFacts;
      return 'generated chapter 2 text';
    };

    const useCase = createUseCase(repo, storage, generator, world);
    await useCase.execute({ storyId, chapterIndex: 2 });

    expect(capturedSceneSummary).toBe('the hero found the sword');
    expect(capturedFacts).toEqual([
      {
        factId: 'fact-c0001-001',
        subject: 'Hero',
        predicate: 'holds',
        object: 'sword',
      },
    ]);

    const chapter2 = await repo.getChapter(storyId, 2);
    expect(chapter2.isDone()).toBe(true);
    expect(chapter2.summaryKeyPoints).toBe(generator.extractAtomicFactsResult.sceneSummary);
  });

  it('keeps future chapters as rough outlines while using detailed outlines up to the current chapter', async () => {
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
      { index: 2, title: 'Chapter 2', outline: 'outline 2 detailed' },
      { index: 3, title: 'Chapter 3', outline: 'outline 3 detailed' },
    ];
    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 'plan summary',
        theme: 'plan theme',
        characters: planCharacters,
        chapters,
        roughBeats: [
          {
            beatId: 'beat-setup',
            label: '起',
            summary: '導入の粗い骨格',
            chapterIndexes: [1],
          },
          {
            beatId: 'beat-middle',
            label: '承',
            summary: '中盤の粗い骨格',
            chapterIndexes: [2, 3],
          },
        ],
      }),
    );
    await repo.initializeChapters(
      storyId,
      chapters.map((outline) => Chapter.fromOutline(outline)),
    );

    let detailedIndexes: number[] = [];
    let futureRough: Array<{ index: number; outline: string }> = [];
    generator.generateChapterText = async (input) => {
      detailedIndexes = input.plan.chapters.map((c) => c.index);
      futureRough = (input.plan.futureRoughOutlines ?? []).map((c) => ({
        index: c.index,
        outline: c.outline,
      }));
      return 'generated chapter 1 text';
    };

    const useCase = createUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 1 });

    expect(detailedIndexes).toEqual([1]);
    expect(futureRough.map((c) => c.index)).toEqual([2, 3]);
    expect(futureRough[0].outline).toBe('中盤の粗い骨格');
  });

  it('realigns future plan chapters after a non-final chapter completes', async () => {
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

    let realignCalled = false;
    let captured: RealignFuturePlanInput | undefined;
    generator.realignFuturePlan = async (input) => {
      realignCalled = true;
      captured = input;
      return {
        roughBeats: input.roughBeats,
        chapters: [
          { index: 2, title: 'Revised Chapter 2', outline: 'revised outline 2' },
          { index: 3, title: 'Revised Chapter 3', outline: 'revised outline 3' },
        ],
        characters: [
          {
            ...SAMPLE_PLAN_CHARACTERS[0],
            goals: '剣を手に入れた今、王国を救う',
          },
        ],
      };
    };

    const useCase = createUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 1 });

    expect(realignCalled).toBe(true);
    expect(captured?.futureChapters.map((c) => c.index)).toEqual([2, 3]);

    const plan = await repo.getPlan(storyId);
    expect(plan.chapters[1].title).toBe('Revised Chapter 2');
    expect(plan.characters[0].goals).toContain('王国を救う');

    const snapshots = await repo.listPlanSnapshots(storyId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].trigger).toBe('chapter_revision');
  });

  it('does not realign the plan after the final chapter', async () => {
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

    let realignCalled = false;
    generator.realignFuturePlan = async (input) => {
      realignCalled = true;
      return {
        roughBeats: input.roughBeats,
        chapters: input.futureChapters,
        characters: input.characters,
      };
    };

    const useCase = createUseCase(repo, storage, generator);
    await useCase.execute({ storyId, chapterIndex: 2 });

    expect(realignCalled).toBe(false);
  });

  it('fails the chapter when realignFuturePlan fails', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const storyId = 'story-revise-fail';
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
      Chapter.fromOutline({ index: 1, title: 'Chapter 1', outline: 'outline 1' }),
      Chapter.fromOutline({ index: 2, title: 'Chapter 2', outline: 'outline 2' }),
    ]);

    generator.realignFuturePlan = async () => {
      throw new Error('bedrock realign failed');
    };

    const useCase = createUseCase(repo, storage, generator);
    await expect(useCase.execute({ storyId, chapterIndex: 1 })).rejects.toThrow(
      'bedrock realign failed',
    );
  });

  it('throws ContradictionDetectedError when new facts conflict', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const generator = new FakeNovelTextGenerator();
    const world = new FakeWorldStateRepository();
    const storyId = 'story-contradiction';
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

    generator.detectContradictions = async () => ({
      hasContradiction: true,
      contradictions: [
        {
          newFact: 'Hero holds sword',
          conflictingFact: 'Hero lost sword',
          reason: 'lost item cannot be held',
        },
      ],
    });

    const useCase = createUseCase(repo, storage, generator, world);
    await expect(useCase.execute({ storyId, chapterIndex: 1 })).rejects.toBeInstanceOf(
      ContradictionDetectedError,
    );
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

    const useCase = createUseCase(repo, storage, generator);
    await useCase.execute({
      storyId,
      chapterIndex: 1,
      revisionFeedback: 'もっと緊張感を出して',
    });

    expect(capturedInstruction).toBe('もっと緊張感を出して');
  });
});
