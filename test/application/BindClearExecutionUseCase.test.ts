import { BindExecutionUseCase } from '../../src/application/use-cases/BindExecutionUseCase';
import { ClearExecutionUseCase } from '../../src/application/use-cases/ClearExecutionUseCase';
import { Story } from '../../src/domain/entities/Story';
import { ValidationError } from '../../src/domain/errors/DomainErrors';
import { FakeStoryRepository } from './support/fakes';

describe('BindExecutionUseCase', () => {
  it('binds executionArn when none is set', async () => {
    const repo = new FakeStoryRepository();
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
    await repo.createStory(story);

    const useCase = new BindExecutionUseCase(repo);
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    const output = await useCase.execute({ storyId: story.storyId, executionArn: arn });

    expect(output.executionArn).toBe(arn);
    expect((await repo.getStory(story.storyId)).executionArn).toBe(arn);
  });

  it('is idempotent when the same ARN is already bound', async () => {
    const repo = new FakeStoryRepository();
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
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    story.bindExecution(arn);
    await repo.createStory(story);

    const useCase = new BindExecutionUseCase(repo);
    await useCase.execute({ storyId: story.storyId, executionArn: arn });

    expect((await repo.getStory(story.storyId)).executionArn).toBe(arn);
  });

  it('rejects when a different ARN is already bound', async () => {
    const repo = new FakeStoryRepository();
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
    story.bindExecution('arn:aws:states:us-east-1:123:execution:novel:other');
    await repo.createStory(story);

    const useCase = new BindExecutionUseCase(repo);
    await expect(
      useCase.execute({
        storyId: story.storyId,
        executionArn: 'arn:aws:states:us-east-1:123:execution:novel:new',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ClearExecutionUseCase', () => {
  it('clears only when executionArn matches', async () => {
    const repo = new FakeStoryRepository();
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
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    story.bindExecution(arn);
    await repo.createStory(story);

    const useCase = new ClearExecutionUseCase(repo);
    const output = await useCase.execute({ storyId: story.storyId, executionArn: arn });

    expect(output.cleared).toBe(true);
    expect((await repo.getStory(story.storyId)).executionArn).toBeUndefined();
  });

  it('does not clear when executionArn does not match', async () => {
    const repo = new FakeStoryRepository();
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
    const arn = 'arn:aws:states:us-east-1:123:execution:novel:exec-1';
    story.bindExecution(arn);
    await repo.createStory(story);

    const useCase = new ClearExecutionUseCase(repo);
    const output = await useCase.execute({
      storyId: story.storyId,
      executionArn: 'arn:aws:states:us-east-1:123:execution:novel:other',
    });

    expect(output.cleared).toBe(false);
    expect((await repo.getStory(story.storyId)).executionArn).toBe(arn);
  });
});
