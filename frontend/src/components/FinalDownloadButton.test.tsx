import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinalDownloadButton } from './FinalDownloadButton';

vi.mock('../api/client', () => ({
  getFinalContent: vi.fn(),
}));

import { getFinalContent } from '../api/client';

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FinalDownloadButton storyId="story-1" />
    </QueryClientProvider>,
  );
}

describe('FinalDownloadButton', () => {
  beforeEach(() => {
    vi.mocked(getFinalContent).mockReset();
  });

  it('re-issues a URL and opens it', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.mocked(getFinalContent).mockResolvedValue({
      storyId: 'story-1',
      contentUrl: 'https://signed.example/final.txt',
      expiresInSeconds: 3600,
    });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: '最終原稿をダウンロード' }));

    await waitFor(() => {
      expect(getFinalContent).toHaveBeenCalledWith('story-1');
      expect(open).toHaveBeenCalledWith('https://signed.example/final.txt', '_blank', 'noopener,noreferrer');
    });
    open.mockRestore();
  });
});
