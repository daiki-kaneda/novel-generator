import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runtimeConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const validConfig = {
    apiBaseUrl: 'https://api.example.com/',
    cognitoUserPoolId: 'ap-northeast-1_abc123',
    cognitoUserPoolClientId: 'client-id-123',
  };

  it('loads config and strips a trailing slash from apiBaseUrl', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validConfig),
      }),
    );
    const { loadRuntimeConfig, getRuntimeConfig } = await import('./runtimeConfig');

    const config = await loadRuntimeConfig();

    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.cognitoUserPoolId).toBe('ap-northeast-1_abc123');
    expect(config.cognitoUserPoolClientId).toBe('client-id-123');
    expect(getRuntimeConfig().apiBaseUrl).toBe('https://api.example.com');
  });

  it('rejects with a helpful message when apiBaseUrl is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...validConfig, apiBaseUrl: undefined }),
      }),
    );
    const { loadRuntimeConfig } = await import('./runtimeConfig');

    await expect(loadRuntimeConfig()).rejects.toThrow('apiBaseUrl');
  });

  it('rejects with a helpful message when cognitoUserPoolId is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...validConfig, cognitoUserPoolId: undefined }),
      }),
    );
    const { loadRuntimeConfig } = await import('./runtimeConfig');

    await expect(loadRuntimeConfig()).rejects.toThrow('cognitoUserPoolId');
  });

  it('rejects when config.json cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { loadRuntimeConfig } = await import('./runtimeConfig');

    await expect(loadRuntimeConfig()).rejects.toThrow('404');
  });

  it('getRuntimeConfig throws before loadRuntimeConfig has resolved', async () => {
    const { getRuntimeConfig } = await import('./runtimeConfig');
    expect(() => getRuntimeConfig()).toThrow('not loaded');
  });
});
