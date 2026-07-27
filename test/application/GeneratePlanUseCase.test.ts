import { GeneratePlanUseCase } from '../../src/application/use-cases/GeneratePlanUseCase';
import { Plan, PlanSnapshot } from '../../src/domain/entities/Plan';
import { Story } from '../../src/domain/entities/Story';
import { StoryMetadata } from '../../src/domain/entities/StoryMetadata';
import {
  FakeStoryRepository,
  FakeNovelTextGenerator,
  SAMPLE_PLAN_CHARACTERS,
} from './support/fakes';

async function seedStoryWithMetadata(repo: FakeStoryRepository): Promise<string> {
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
  await repo.saveMetadata(
    story.storyId,
    StoryMetadata.create({
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
    }),
  );
  return story.storyId;
}

describe('GeneratePlanUseCase', () => {
  it('persists an initial plan snapshot after generation', async () => {
    const repo = new FakeStoryRepository();
    const generator = new FakeNovelTextGenerator();
    const storyId = await seedStoryWithMetadata(repo);

    generator.generatePlanResult = {
      summary: 'plan summary',
      theme: 'plan theme',
      characters: SAMPLE_PLAN_CHARACTERS.map((c) => ({ ...c })),
      chapters: [
        { index: 1, title: 'Chapter 1', outline: 'outline 1' },
        { index: 2, title: 'Chapter 2', outline: 'outline 2' },
      ],
    };

    const useCase = new GeneratePlanUseCase(repo, generator);
    await useCase.execute({ storyId });

    const snapshots = await repo.listPlanSnapshots(storyId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].afterChapterIndex).toBe(0);
    expect(snapshots[0].trigger).toBe('initial');
    expect(snapshots[0].plan.summary).toBe('plan summary');
    expect(snapshots[0].plan.chapters).toHaveLength(2);
  });

  it('clears previous snapshots when the plan is regenerated', async () => {
    const repo = new FakeStoryRepository();
    const generator = new FakeNovelTextGenerator();
    const storyId = await seedStoryWithMetadata(repo);

    generator.generatePlanResult = {
      summary: 'first plan',
      theme: 'theme',
      characters: SAMPLE_PLAN_CHARACTERS.map((c) => ({ ...c })),
      chapters: [{ index: 1, title: 'Chapter 1', outline: 'outline 1' }],
    };

    const useCase = new GeneratePlanUseCase(repo, generator);
    await useCase.execute({ storyId });

    await repo.savePlanSnapshot(
      storyId,
      PlanSnapshot.create({
        afterChapterIndex: 1,
        trigger: 'chapter_revision',
        plan: Plan.create({
          summary: 'revised after ch1',
          theme: 'theme',
          characters: SAMPLE_PLAN_CHARACTERS,
          chapters: [{ index: 1, title: 'Chapter 1', outline: 'updated' }],
        }).toProps(),
      }),
    );
    expect(await repo.listPlanSnapshots(storyId)).toHaveLength(2);

    generator.generatePlanResult = {
      summary: 'second plan',
      theme: 'theme',
      characters: SAMPLE_PLAN_CHARACTERS.map((c) => ({ ...c })),
      chapters: [
        { index: 1, title: 'New Chapter 1', outline: 'new outline 1' },
        { index: 2, title: 'New Chapter 2', outline: 'new outline 2' },
      ],
    };
    await useCase.execute({ storyId, feedback: 'もっと緊張感を' });

    const snapshots = await repo.listPlanSnapshots(storyId);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].afterChapterIndex).toBe(0);
    expect(snapshots[0].trigger).toBe('initial');
    expect(snapshots[0].plan.summary).toBe('second plan');
    expect(snapshots[0].plan.chapters).toHaveLength(2);
  });
});
