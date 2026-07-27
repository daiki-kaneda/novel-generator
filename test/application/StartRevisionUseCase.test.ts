import { StartRevisionUseCase } from '../../src/application/use-cases/StartRevisionUseCase';
import { Plan } from '../../src/domain/entities/Plan';
import { Story } from '../../src/domain/entities/Story';
import { ValidationError } from '../../src/domain/errors/DomainErrors';
import {
  FakeStoryRepository,
  FakeWorkflowStarter,
  SAMPLE_PLAN_CHARACTERS,
} from './support/fakes';

async function buildCompletedStory(repo: FakeStoryRepository): Promise<Story> {
  const story = Story.submit({
    overview: 'o',
    theme: 't',
    characters: 'c',
    userEmail: 'u@example.com',
    requireMetadataApproval: false,
    requirePlanApproval: false,
    requireChapterApproval: false,
    length: 'short',
  });
  story.complete('https://example.com/final.txt');
  await repo.createStory(story);
  await repo.savePlan(
    story.storyId,
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
  return story;
}

describe('StartRevisionUseCase', () => {
  it('starts the workflow with revision fields and moves story to CHAPTERS_GENERATING', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = await buildCompletedStory(repo);
    const useCase = new StartRevisionUseCase(repo, starter);

    const output = await useCase.execute({
      storyId: story.storyId,
      rewriteFromChapterIndex: 2,
      feedback: 'Fix the middle act',
    });

    expect(output.executionArn).toBe(starter.nextExecutionArn);
    expect(output.rewriteFromChapterIndex).toBe(2);
    expect(starter.started).toEqual([
      {
        storyId: story.storyId,
        feedback: 'Fix the middle act',
        rewriteFromChapterIndex: 2,
      },
    ]);

    const updated = await repo.getStory(story.storyId);
    expect(updated.status).toBe('CHAPTERS_GENERATING');
    expect(updated.executionArn).toBe(starter.nextExecutionArn);
  });

  it('rejects when story is not COMPLETED', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = Story.submit({
      overview: 'o',
      theme: 't',
      characters: 'c',
      userEmail: 'u@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      length: 'short',
    });
    await repo.createStory(story);
    const useCase = new StartRevisionUseCase(repo, starter);

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 1,
        feedback: 'redo',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(starter.started).toHaveLength(0);
  });

  it('rejects empty feedback', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = await buildCompletedStory(repo);
    const useCase = new StartRevisionUseCase(repo, starter);

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 1,
        feedback: '   ',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(starter.started).toHaveLength(0);
  });

  it('rejects rewriteFromChapterIndex beyond plan chapters', async () => {
    const repo = new FakeStoryRepository();
    const starter = new FakeWorkflowStarter();
    const story = await buildCompletedStory(repo);
    const useCase = new StartRevisionUseCase(repo, starter);

    await expect(
      useCase.execute({
        storyId: story.storyId,
        rewriteFromChapterIndex: 9,
        feedback: 'too far',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(starter.started).toHaveLength(0);
  });
});
