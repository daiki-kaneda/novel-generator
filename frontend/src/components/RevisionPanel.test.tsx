import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RevisionPanel } from './RevisionPanel';

vi.mock('../api/client', () => ({
  startRevision: vi.fn(),
}));

import { startRevision } from '../api/client';

const chapters = [
  { index: 1, title: '出会い', outline: 'o1' },
  { index: 2, title: '嵐', outline: 'o2' },
  { index: 3, title: '赦し', outline: 'o3' },
];

function renderPanel(queryClient?: QueryClient) {
  const client =
    queryClient ?? new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RevisionPanel storyId="story-1" chapters={chapters} />
    </QueryClientProvider>,
  );
}

describe('RevisionPanel', () => {
  beforeEach(() => {
    vi.mocked(startRevision).mockReset();
  });

  it('is collapsed until the user opens it', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: '部分再生成を始める' })).toBeInTheDocument();
    expect(screen.queryByLabelText('再生成を開始する章')).not.toBeInTheDocument();
  });

  it('defaults the start chapter to the last chapter', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '部分再生成を始める' }));
    expect(screen.getByLabelText('再生成を開始する章')).toHaveValue('3');
  });

  it('does not call the API without feedback', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '部分再生成を始める' }));
    fireEvent.click(screen.getByRole('button', { name: '内容を確認する' }));
    const start = screen.queryByRole('button', { name: '再生成を開始する' });
    if (start) {
      fireEvent.click(start);
    }
    expect(startRevision).not.toHaveBeenCalled();
  });

  it('starts a revision from the selected chapter and invalidates the story query', async () => {
    vi.mocked(startRevision).mockResolvedValue({
      storyId: 'story-1',
      executionArn: 'arn:exec',
      rewriteFromChapterIndex: 2,
    });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderPanel(queryClient);
    fireEvent.click(screen.getByRole('button', { name: '部分再生成を始める' }));
    fireEvent.change(screen.getByLabelText('再生成を開始する章'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('修正してほしい点（必須）'), {
      target: { value: '第2章の展開を緩めてほしい' },
    });
    fireEvent.click(screen.getByRole('button', { name: '内容を確認する' }));
    expect(screen.getByText(/第2章「嵐」以降を再生成します/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再生成を開始する' }));

    await waitFor(() => {
      expect(startRevision).toHaveBeenCalledWith('story-1', {
        rewriteFromChapterIndex: 2,
        feedback: '第2章の展開を緩めてほしい',
      });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['story', 'story-1'] });
    });
  });
});
