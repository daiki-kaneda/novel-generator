import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runtimeConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads apiBaseUrl and strips a trailing slash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ apiBaseUrl: 'https://api.example.com/' }),
      }),
    );
    const { loadRuntimeConfig, getRuntimeConfig } = await import('./runtimeConfig');

    const config = await loadRuntimeConfig();

    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(getRuntimeConfig().apiBaseUrl).toBe('https://api.example.com');
  });

  it('rejects with a helpful message when apiBaseUrl is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );
    const { loadRuntimeConfig } = await import('./runtimeConfig');

    await expect(loadRuntimeConfig()).rejects.toThrow('apiBaseUrl');
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
