import { CompensateChapterFailureUseCase } from '../../src/application/use-cases/CompensateChapterFailureUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Chapter } from '../../src/domain/entities/Chapter';
import { Story } from '../../src/domain/entities/Story';
import { serializeContradictionError } from '../../src/domain/value-objects/ChapterGenerationError';
import {
  FakeStoryRepository,
  FakeChapterContentStorage,
  FakeWorldStateRepository,
  SAMPLE_PLAN_CHARACTERS,
} from './support/fakes';

describe('CompensateChapterFailureUseCase', () => {
  async function seed(repo: FakeStoryRepository, storage: FakeChapterContentStorage) {
    const story = Story.submit(
      {
        overview: 'o',
        theme: 't',
        characters: 'c',
        userEmail: 'u@example.com',
        requireMetadataApproval: false,
        requirePlanApproval: false,
        requireChapterApproval: false,
        requireFinalApproval: true,
        length: 'short',
      },
      'owner-1',
    );
    await repo.createStory(story);
    await repo.savePlan(
      story.storyId,
      Plan.create({
        summary: 's',
        theme: 't',
        characters: SAMPLE_PLAN_CHARACTERS,
        chapters: [{ index: 1, title: 'C1', outline: 'o1' }],
      }),
    );
    const s3Key = await storage.saveChapterText(story.storyId, 1, 'draft that contradicted');
    await repo.initializeChapters(story.storyId, [
      Chapter.restore({
        index: 1,
        title: 'C1',
        outline: 'o1',
        status: 'PENDING',
        s3Key,
      }),
    ]);
    return { story, s3Key };
  }

  it('records a user-facing chapter error instead of the Lambda Cause JSON', async () => {
    const repo = new FakeStoryRepository();
    const storage = new FakeChapterContentStorage();
    const world = new FakeWorldStateRepository();
    const { story, s3Key } = await seed(repo, storage);
    const contradictions = [
      {
        newFact: '主人公が剣を持っている',
        conflictingFact: '主人公は剣を失った',
        reason: '失ったものを所持できない',
      },
    ];

    await new CompensateChapterFailureUseCase(repo, world, storage).execute({
      storyId: story.storyId,
      chapterIndex: 1,
      error: {
        Error: 'ContradictionDetectedError',
        Cause: JSON.stringify({
          errorType: 'ContradictionDetectedError',
          errorMessage: serializeContradictionError(1, contradictions),
          trace: ['ContradictionDetectedError: boom', '    at GenerateChapterUseCase.execute'],
        }),
      },
    });

    const savedStory = await repo.getStory(story.storyId);
    expect(savedStory.lastChapterError?.kind).toBe('contradiction');
    expect(savedStory.lastChapterError?.message).toContain('矛盾');
    expect(savedStory.lastChapterError?.message).not.toContain('errorType');
    expect(savedStory.lastChapterError?.contradictions).toEqual(contradictions);

    const plan = await repo.getPlan(story.storyId);
    expect(plan.forbiddenDevelopments[0]).toContain('主人公が剣を持っている');
    expect(plan.forbiddenDevelopments[0]).not.toContain('errorType');
    expect(plan.forbiddenDevelopments[0]).not.toContain('at GenerateChapterUseCase');

    const chapter = await repo.getChapter(story.storyId, 1);
    expect(chapter.status).toBe('PENDING');
    expect(chapter.s3Key).toBeUndefined();
    await expect(storage.getChapterText(story.storyId, s3Key)).rejects.toThrow();
  });
});
