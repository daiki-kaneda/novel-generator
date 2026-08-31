import { ListMyStoriesUseCase } from '../../src/application/use-cases/ListMyStoriesUseCase';
import { Story } from '../../src/domain/entities/Story';
import { FakeStoryRepository } from './support/fakes';

function submit(ownerId: string, overview: string) {
  return Story.submit(
    {
      overview,
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
      requireMetadataApproval: true,
      requirePlanApproval: true,
      requireChapterApproval: false,
      requireFinalApproval: true,
      length: 'short',
    },
    ownerId,
  );
}

describe('ListMyStoriesUseCase', () => {
  it('returns only stories owned by the caller, newest first', async () => {
    const repo = new FakeStoryRepository();
    const older = submit('owner-1', 'older story');
    await repo.createStory(older);
    // 別のstoryIdへ、createdAtを未来にずらして復元し、順序を確定的にテストする。
    const newerWithLaterDate = Story.restore({
      ...older.toProps(),
      storyId: '00000000-0000-4000-8000-000000000123',
      createdAt: '2099-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:00.000Z',
    });
    await repo.createStory(newerWithLaterDate);

    const someoneElse = submit('owner-2', 'not mine');
    await repo.createStory(someoneElse);

    const output = await new ListMyStoriesUseCase(repo).execute('owner-1');

    expect(output.stories).toHaveLength(2);
    expect(output.stories.map((s) => s.storyId)).toEqual([
      newerWithLaterDate.storyId,
      older.storyId,
    ]);
    expect(output.stories[1].overview).toBe('older story');
    expect(output.stories[1].status).toBe('SUBMITTED');
  });

  it('returns an empty list when the caller has no stories', async () => {
    const repo = new FakeStoryRepository();
    const output = await new ListMyStoriesUseCase(repo).execute('owner-without-stories');
    expect(output.stories).toEqual([]);
  });
});
