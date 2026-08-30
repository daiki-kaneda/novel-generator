import { SubmitStoryUseCase } from '../../src/application/use-cases/SubmitStoryUseCase';
import { BudgetExceededError } from '../../src/domain/errors/DomainErrors';
import {
  FakeStoryRepository,
  FakeRequestQueue,
  FakeUsageAccountRepository,
} from './support/fakes';

describe('SubmitStoryUseCase', () => {
  it('creates a story and enqueues a request for it', async () => {
    const storyRepository = new FakeStoryRepository();
    const requestQueue = new FakeRequestQueue();
    const useCase = new SubmitStoryUseCase(
      storyRepository,
      requestQueue,
      new FakeUsageAccountRepository(),
    );

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
    expect(stored.request.requireFinalApproval).toBe(true);
    expect(stored.request.length).toBe('short');
  });

  it('persists optional approval flags, setting, and length when provided', async () => {
    const storyRepository = new FakeStoryRepository();
    const requestQueue = new FakeRequestQueue();
    const useCase = new SubmitStoryUseCase(
      storyRepository,
      requestQueue,
      new FakeUsageAccountRepository(),
    );

    const result = await useCase.execute({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      setting: '孤島の灯台',
      userEmail: 'user@example.com',
      requireMetadataApproval: false,
      requirePlanApproval: false,
      requireChapterApproval: true,
      requireFinalApproval: false,
      length: 'medium',
    });

    const stored = await storyRepository.getStory(result.storyId);
    expect(stored.request.setting).toBe('孤島の灯台');
    expect(stored.request.requireMetadataApproval).toBe(false);
    expect(stored.request.requirePlanApproval).toBe(false);
    expect(stored.request.requireChapterApproval).toBe(true);
    expect(stored.request.requireFinalApproval).toBe(false);
    expect(stored.request.length).toBe('medium');
  });

  it('allows all approvals off including final for batch evaluation', async () => {
    const storyRepository = new FakeStoryRepository();
    const requestQueue = new FakeRequestQueue();
    const useCase = new SubmitStoryUseCase(
      storyRepository,
      requestQueue,
      new FakeUsageAccountRepository(),
    );

    const result = await useCase.execute({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'user@example.com',
      requireMetadataApproval: false,
      requirePlanApproval: false,
      requireChapterApproval: false,
      requireFinalApproval: false,
    });

    const stored = await storyRepository.getStory(result.storyId);
    expect(stored.request.requireMetadataApproval).toBe(false);
    expect(stored.request.requirePlanApproval).toBe(false);
    expect(stored.request.requireChapterApproval).toBe(false);
    expect(stored.request.requireFinalApproval).toBe(false);
  });

  it('rejects when the user has exhausted their monthly usage budget', async () => {
    const storyRepository = new FakeStoryRepository();
    const requestQueue = new FakeRequestQueue();
    const usageAccountRepository = new FakeUsageAccountRepository();
    usageAccountRepository.seedCurrentMonthUsage('user@example.com', { totalCostUsd: 2 });
    const useCase = new SubmitStoryUseCase(storyRepository, requestQueue, usageAccountRepository);

    await expect(
      useCase.execute({
        overview: 'overview',
        theme: 'theme',
        characters: 'characters',
        userEmail: 'user@example.com',
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(requestQueue.enqueued).toHaveLength(0);
  });

  it('allows submission on a higher plan tier when the free budget is already spent', async () => {
    const storyRepository = new FakeStoryRepository();
    const requestQueue = new FakeRequestQueue();
    const usageAccountRepository = new FakeUsageAccountRepository();
    usageAccountRepository.seedCurrentMonthUsage('pro-user@example.com', { totalCostUsd: 2 });
    usageAccountRepository.planTiers.set('pro-user@example.com', 'pro');
    const useCase = new SubmitStoryUseCase(storyRepository, requestQueue, usageAccountRepository);

    const result = await useCase.execute({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      userEmail: 'pro-user@example.com',
    });

    expect(result.storyId).toBeDefined();
  });
});
