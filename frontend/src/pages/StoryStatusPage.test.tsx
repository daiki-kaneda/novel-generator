import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { StoryStatus, StoryStatusOutput } from '../api/types';
import { StoryStatusPage } from './StoryStatusPage';

vi.mock('../hooks/useStoryStatus', () => ({
  useStoryStatus: vi.fn(),
}));

import { useStoryStatus } from '../hooks/useStoryStatus';

const planChapters = [
  { index: 1, title: '出会い', outline: 'o1' },
  { index: 2, title: '嵐', outline: 'o2' },
];

function story(status: StoryStatus, extras: Partial<StoryStatusOutput> = {}): StoryStatusOutput {
  return {
    storyId: 'story-1',
    status,
    requireMetadataApproval: true,
    requirePlanApproval: true,
    requireChapterApproval: false,
    requireFinalApproval: true,
    length: 'short',
    request: { overview: '概要', theme: 'テーマ', characters: '人物' },
    planSnapshots: [],
    chapters: [],
    ...extras,
  };
}

function renderPage(data: StoryStatusOutput | undefined, error?: Error) {
  vi.mocked(useStoryStatus).mockReturnValue({
    data,
    error: error ?? null,
    isLoading: false,
    isFetching: false,
  } as ReturnType<typeof useStoryStatus>);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/stories/story-1']}>
        <Routes>
          <Route path="/stories/:storyId" element={<StoryStatusPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoryStatusPage revision entry', () => {
  it('shows the revision panel when the story is completed and has a plan', () => {
    renderPage(
      story('COMPLETED', {
        plan: {
          summary: 's',
          theme: 't',
          characters: [],
          chapters: planChapters,
          roughBeats: [],
          forbiddenDevelopments: [],
        },
      }),
    );

    expect(screen.getByRole('heading', { name: 'ここから書き直す' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '部分再生成を始める' })).toBeInTheDocument();
  });

  it('shows the revision panel when a failed story still has a plan', () => {
    renderPage(
      story('FAILED', {
        failureReason: '章生成がタイムアウトしました',
        plan: {
          summary: 's',
          theme: 't',
          characters: [],
          chapters: planChapters,
          roughBeats: [],
          forbiddenDevelopments: [],
        },
      }),
    );

    expect(screen.getByRole('heading', { name: 'ここから書き直す' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '新しい物語を送信する' })).not.toBeInTheDocument();
  });

  it('does not show the revision panel when a failed story has no plan', () => {
    renderPage(story('FAILED', { failureReason: '設定書の生成に失敗しました' }));

    expect(screen.queryByRole('heading', { name: 'ここから書き直す' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新しい物語を送信する' })).toBeInTheDocument();
  });

  it('does not show the revision panel while generating or awaiting approval', () => {
    renderPage(story('CHAPTERS_GENERATING', {
      plan: {
        summary: 's',
        theme: 't',
        characters: [],
        chapters: planChapters,
        roughBeats: [],
        forbiddenDevelopments: [],
      },
    }));

    expect(screen.queryByRole('heading', { name: 'ここから書き直す' })).not.toBeInTheDocument();
  });
});
