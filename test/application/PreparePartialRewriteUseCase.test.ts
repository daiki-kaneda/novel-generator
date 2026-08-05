import { PreparePartialRewriteUseCase } from '../../src/application/use-cases/PreparePartialRewriteUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Chapter } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import { StoryMetadata } from '../../src/domain/entities/StoryMetadata';
import { AtomicFact, WorldStateSnapshot } from '../../src/domain/entities/WorldState';
import {
  FakeStoryRepository,
  FakeChapterContentStorage,
  FakeWorldStateRepository,
  SAMPLE_PLAN_CHARACTERS,
} from './support/fakes';

describe('PreparePartialRewriteUseCase', () => {
  it('resets only chapters from the rewrite index onward and rolls back TKG', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const world = new FakeWorldStateRepository();

    const story = Story.submit({
      overview: 'o',
      theme: 't',
      characters: 'c',
      userEmail: 'u@example.com',
      requireMetadataApproval: false,
      requirePlanApproval: false,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    });
    const storyId = story.storyId;
    await repo.createStory(story);
    await repo.saveMetadata(
      storyId,
      StoryMetadata.create({
        overview: 'o',
        theme: 't',
        tone: 'tone',
        characters: SAMPLE_PLAN_CHARACTERS,
        world: { geography: 'g', timePeriod: 't' },
        timelineRules: 'tr',
        consistencyNotes: 'cn',
      }),
    );
    await repo.savePlan(
      storyId,
      Plan.create({
        summary: 's',
        theme: 't',
        characters: SAMPLE_PLAN_CHARACTERS,
        chapters: [
          { index: 1, title: 'C1', outline: 'o1' },
          { index: 2, title: 'C2', outline: 'o2' },
          { index: 3, title: 'C3', outline: 'o3' },
        ],
      }),
    );

    const key1 = await storage.saveChapterText(storyId, 1, 'chapter 1');
    const key2 = await storage.saveChapterText(storyId, 2, 'chapter 2');
    const key3 = await storage.saveChapterText(storyId, 3, 'chapter 3');
    await repo.initializeChapters(storyId, [
      Chapter.restore({
        index: 1,
        title: 'C1',
        outline: 'o1',
        status: 'DONE',
        s3Key: key1,
        summaryKeyPoints: 's1',
      }),
      Chapter.restore({
        index: 2,
        title: 'C2',
        outline: 'o2',
        status: 'DONE',
        s3Key: key2,
        summaryKeyPoints: 's2',
      }),
      Chapter.restore({
        index: 3,
        title: 'C3',
        outline: 'o3',
        status: 'DONE',
        s3Key: key3,
        summaryKeyPoints: 's3',
      }),
    ]);

    const fact1: AtomicFact = {
      factId: 'fact-1',
      subject: 'Hero',
      predicate: 'at',
      object: 'town',
      entityIds: ['char-hero'],
      validFromChapter: 1,
      sourceChapterIndex: 1,
    };
    const fact2: AtomicFact = {
      factId: 'fact-2',
      subject: 'Hero',
      predicate: 'lost',
      object: 'sword',
      entityIds: ['char-hero'],
      validFromChapter: 2,
      sourceChapterIndex: 2,
    };
    await world.saveSnapshot(
      storyId,
      WorldStateSnapshot.create({
        afterChapterIndex: 1,
        entities: [
          {
            entityId: 'char-hero',
            name: 'Hero',
            kind: 'character',
            attributes: 'hero',
            updatedAtChapter: 1,
          },
        ],
        facts: [fact1],
      }),
    );
    await world.saveSnapshot(
      storyId,
      WorldStateSnapshot.create({
        afterChapterIndex: 2,
        entities: [
          {
            entityId: 'char-hero',
            name: 'Hero',
            kind: 'character',
            attributes: 'hero',
            updatedAtChapter: 2,
          },
        ],
        facts: [fact1, fact2],
      }),
    );
    await world.upsertEntities(storyId, [
      {
        entityId: 'char-hero',
        name: 'Hero',
        kind: 'character',
        attributes: 'hero',
        updatedAtChapter: 2,
      },
    ]);
    await world.appendFacts(storyId, [fact1, fact2]);

    const useCase = new PreparePartialRewriteUseCase(repo, world, storage);
    const result = await useCase.execute({
      storyId,
      rewriteFromChapterIndex: 2,
      feedback: '2章以降のテンポを上げて',
    });

    expect(result.chapterIndexes).toEqual([2, 3]);
    expect(result.requireChapterApproval).toBe(false);
    expect(result.requireFinalApproval).toBe(true);

    const chapter1 = await repo.getChapter(storyId, 1);
    expect(chapter1.isDone()).toBe(true);
    expect(chapter1.summaryKeyPoints).toBe('s1');

    const chapter2 = await repo.getChapter(storyId, 2);
    expect(chapter2.isDone()).toBe(false);
    expect(chapter2.revisionInstruction).toBe('2章以降のテンポを上げて');

    await expect(storage.getChapterText(storyId, key1)).resolves.toBe('chapter 1');
    await expect(storage.getChapterText(storyId, key2)).rejects.toThrow();

    const active = await world.listActiveFacts(storyId, 2);
    expect(active.map((f) => f.factId)).toEqual(['fact-1']);

    const plan = await repo.getPlan(storyId);
    expect(plan.forbiddenDevelopments).toContain('2章以降のテンポを上げて');
  });
});
