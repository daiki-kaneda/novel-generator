import { GetStoryStatusUseCase } from '../../src/application/use-cases/GetStoryStatusUseCase';
import { Plan, PlanSnapshot } from '../../src/domain/entities/Plan';
import { Chapter } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import { StoryMetadata } from '../../src/domain/entities/StoryMetadata';
import { FakeStoryRepository, SAMPLE_PLAN_CHARACTERS } from './support/fakes';

describe('GetStoryStatusUseCase', () => {
  it('returns planSnapshots in afterChapterIndex order', async () => {
    const repo = new FakeStoryRepository();
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
        tone: 'tone',
        characters: SAMPLE_PLAN_CHARACTERS.map((c) => ({ ...c })),
        world: { geography: 'geo', timePeriod: 'era' },
        timelineRules: 'rules',
        consistencyNotes: 'notes',
      }),
    );

    const plan = Plan.create({
      summary: 'current plan',
      theme: 'theme',
      characters: SAMPLE_PLAN_CHARACTERS,
      chapters: [
        { index: 1, title: 'Chapter 1', outline: 'outline 1' },
        { index: 2, title: 'Chapter 2', outline: 'outline 2' },
      ],
    });
    await repo.savePlan(story.storyId, plan);
    await repo.initializeChapters(
      story.storyId,
      plan.chapters.map((outline) => Chapter.fromOutline(outline)),
    );

    await repo.savePlanSnapshot(
      story.storyId,
      PlanSnapshot.create({
        afterChapterIndex: 1,
        trigger: 'chapter_revision',
        recordedAt: '2026-01-02T00:00:00.000Z',
        plan: {
          ...plan.toProps(),
          summary: 'after chapter 1',
        },
      }),
    );
    await repo.savePlanSnapshot(
      story.storyId,
      PlanSnapshot.create({
        afterChapterIndex: 0,
        trigger: 'initial',
        recordedAt: '2026-01-01T00:00:00.000Z',
        plan: plan.toProps(),
      }),
    );

    const useCase = new GetStoryStatusUseCase(repo);
    const status = await useCase.execute(story.storyId);

    expect(status.planSnapshots).toHaveLength(2);
    expect(status.planSnapshots.map((s) => s.afterChapterIndex)).toEqual([0, 1]);
    expect(status.planSnapshots[0].trigger).toBe('initial');
    expect(status.planSnapshots[1].trigger).toBe('chapter_revision');
    expect(status.planSnapshots[1].plan.summary).toBe('after chapter 1');
    expect(status.plan?.summary).toBe('current plan');
  });
});
