import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryStatusOutput } from '../api/types';

vi.mock('../api/client', () => ({
  getChapterContent: vi.fn(),
  getStoryStatus: vi.fn(),
}));

import { getChapterContent, getStoryStatus } from '../api/client';
import { ChapterReaderPage } from './ChapterReaderPage';

function story(extras: Partial<StoryStatusOutput> = {}): StoryStatusOutput {
  return {
    storyId: 'story-1',
    status: 'CHAPTERS_GENERATING',
    requireMetadataApproval: true,
    requirePlanApproval: true,
    requireChapterApproval: false,
    requireFinalApproval: true,
    length: 'short',
    request: { overview: '概要', theme: 'テーマ', characters: '人物' },
    planSnapshots: [],
    chapters: [
      { index: 1, title: '出会い', status: 'DONE' },
      { index: 2, title: '嵐', status: 'DONE' },
      { index: 3, title: '赦し', status: 'PENDING' },
    ],
    ...extras,
  };
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/stories/:storyId/chapters/:chapterIndex" element={<ChapterReaderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ChapterReaderPage', () => {
  beforeEach(() => {
    vi.mocked(getChapterContent).mockReset();
    vi.mocked(getStoryStatus).mockReset();
    vi.mocked(getStoryStatus).mockResolvedValue(story());
    vi.mocked(getChapterContent).mockResolvedValue({
      storyId: 'story-1',
      chapterIndex: 2,
      title: '嵐',
      content: '灯台の夜だった。',
      contentUrl: 'https://signed.example/ch2.txt',
      expiresInSeconds: 3600,
    });
  });

  it('renders the chapter title and body in the app', async () => {
    renderAt('/stories/story-1/chapters/2');

    expect(await screen.findByRole('heading', { name: '嵐' })).toBeInTheDocument();
    expect(screen.getByText('灯台の夜だった。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '進行状況に戻る' })).toHaveAttribute('href', '/stories/story-1');
    expect(screen.getByRole('link', { name: '前の章' })).toHaveAttribute('href', '/stories/story-1/chapters/1');
    expect(screen.queryByRole('link', { name: '次の章' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '別タブで開く' })).toHaveAttribute(
      'href',
      'https://signed.example/ch2.txt',
    );
  });

  it('shows the chapter approval form only when this chapter is awaiting approval', async () => {
    vi.mocked(getStoryStatus).mockResolvedValue(
      story({
        status: 'AWAITING_CHAPTER_APPROVAL',
        taskStage: 'chapter',
        currentChapterIndex: 2,
      }),
    );

    renderAt('/stories/story-1/chapters/2');

    expect(await screen.findByRole('heading', { name: '章の承認待ち' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'この章を読む' })).not.toBeInTheDocument();
  });

  it('does not show the approval form when a different chapter is awaiting approval', async () => {
    vi.mocked(getStoryStatus).mockResolvedValue(
      story({
        status: 'AWAITING_CHAPTER_APPROVAL',
        taskStage: 'chapter',
        currentChapterIndex: 1,
      }),
    );

    renderAt('/stories/story-1/chapters/2');

    expect(await screen.findByRole('heading', { name: '嵐' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '章の承認待ち' })).not.toBeInTheDocument();
  });
});
