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
  });
});
