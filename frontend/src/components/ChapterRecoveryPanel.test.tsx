import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterRecoveryPanel } from './ChapterRecoveryPanel';

vi.mock('../api/client', () => ({
  decideChapterApproval: vi.fn(),
}));

import { decideChapterApproval } from '../api/client';

function renderPanel(queryClient?: QueryClient) {
  const client =
    queryClient ?? new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChapterRecoveryPanel
        storyId="story-1"
        chapterIndex={2}
        lastChapterError={{
          chapterIndex: 2,
          kind: 'contradiction',
          message: '第2章の生成で、これまでの設定と矛盾する内容が見つかりました。',
          contradictions: [
            {
              newFact: '主人公が剣を持っている',
              conflictingFact: '主人公は剣を失った',
              reason: '失ったものを所持できない',
            },
          ],
        }}
      />
    </QueryClientProvider>,
  );
}

describe('ChapterRecoveryPanel', () => {
  beforeEach(() => {
    vi.mocked(decideChapterApproval).mockReset();
  });

  it('explains the failure and does not offer an approve-to-continue action', () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: '第2章の生成に失敗しました' })).toBeInTheDocument();
    expect(screen.getByText(/承認しても先の章へは進めません/)).toBeInTheDocument();
    expect(screen.getByText(/主人公が剣を持っている/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '承認する' })).not.toBeInTheDocument();
  });

  it('retries generation with feedback instead of approving', async () => {
    vi.mocked(decideChapterApproval).mockResolvedValue({
      storyId: 'story-1',
      stage: 'chapter',
      chapterIndex: 2,
      approved: false,
    });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '指示を出して再生成する' }));
    fireEvent.change(screen.getByLabelText('修正してほしい点（必須）'), {
      target: { value: '剣を失った設定と矛盾しない展開にしてほしい' },
    });
    fireEvent.click(screen.getByRole('button', { name: '再生成する' }));

    await waitFor(() => {
      expect(decideChapterApproval).toHaveBeenCalledWith('story-1', 2, {
        approved: false,
        feedback: '剣を失った設定と矛盾しない展開にしてほしい',
      });
    });
  });

  it('can abort the workflow from the recovery panel', async () => {
    vi.mocked(decideChapterApproval).mockResolvedValue({
      storyId: 'story-1',
      stage: 'chapter',
      chapterIndex: 2,
      approved: false,
    });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '生成を中止する' }));
    fireEvent.click(screen.getByRole('button', { name: '生成を中止する' }));

    await waitFor(() => {
      expect(decideChapterApproval).toHaveBeenCalledWith('story-1', 2, {
        approved: false,
        abort: true,
      });
    });
  });
});
