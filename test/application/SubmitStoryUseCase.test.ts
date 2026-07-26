import { SubmitStoryUseCase } from '../../src/application/use-cases/SubmitStoryUseCase';
import { FakeStoryRepository, FakeRequestQueue } from './support/fakes';

describe('SubmitStoryUseCase', () => {
  it('creates a story and enqueues a request for it', async () => {
    const storyRepository = new FakeStoryRepository();
    const requestQueue = new FakeRequestQueue();
    const useCase = new SubmitStoryUseCase(storyRepository, requestQueue);

    const result = await useCase.execute({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
    });

    expect(result.storyId).toBeDefined();
    expect(requestQueue.enqueued).toEqual([result.storyId]);

    const stored = await storyRepository.getStory(result.storyId);
    expect(stored.status).toBe('SUBMITTED');
    expect(stored.request.userEmail).toBe('user@example.com');
    expect(stored.request.requireMetadataApproval).toBe(true);
    expect(stored.request.requirePlanApproval).toBe(true);
    expect(stored.request.requireChapterApproval).toBe(false);
    expect(stored.request.length).toBe('short');
  });

  it('persists optional approval flags, setting, and length when provided', async () => {
    const storyRepository = new FakeStoryRepository();
    const requestQueue = new FakeRequestQueue();
    const useCase = new SubmitStoryUseCase(storyRepository, requestQueue);

    const result = await useCase.execute({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      setting: '孤島の灯台',
      userEmail: 'user@example.com',
      requireMetadataApproval: false,
      requirePlanApproval: false,
      requireChapterApproval: true,
      length: 'medium',
    });

    const stored = await storyRepository.getStory(result.storyId);
    expect(stored.request.setting).toBe('孤島の灯台');
    expect(stored.request.requireMetadataApproval).toBe(false);
    expect(stored.request.requirePlanApproval).toBe(false);
    expect(stored.request.requireChapterApproval).toBe(true);
    expect(stored.request.length).toBe('medium');
  });
});
