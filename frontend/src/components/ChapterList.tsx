import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { getChapterContent } from '../api/client';
import type { StoryStatusOutput } from '../api/types';
import { CHAPTER_STATUS_LABELS } from '../utils/statusLabels';

function ChapterContentLink({ storyId, chapterIndex }: { storyId: string; chapterIndex: number }) {
  const [error, setError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => getChapterContent(storyId, chapterIndex),
    onSuccess: (data) => {
      setError(undefined);
      window.open(data.contentUrl, '_blank', 'noopener,noreferrer');
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : '本文の取得に失敗しました');
    },
  });

  return (
    <div className="chapter-list__actions">
      <button type="button" className="btn btn--secondary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? '取得中…' : '本文を読む'}
      </button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function ChapterList({
  storyId,
  chapters,
  currentChapterIndex,
}: {
  storyId: string;
  chapters: StoryStatusOutput['chapters'];
  currentChapterIndex?: number;
}) {
  if (chapters.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3>章の状態</h3>
      <ul className="chapter-list">
        {chapters.map((chapter) => (
          <li
            key={chapter.index}
            className={`chapter-list__item ${chapter.index === currentChapterIndex ? 'chapter-list__item--active' : ''}`}
          >
            <div className="chapter-list__head">
              <span className="chapter-list__index">第{chapter.index}章</span>
              <span className="chapter-list__title">{chapter.title}</span>
              <span className={`chip chip--${chapter.status === 'DONE' ? 'done' : 'pending'}`}>
                {CHAPTER_STATUS_LABELS[chapter.status]}
              </span>
            </div>
            {chapter.summaryKeyPoints && <p className="chapter-list__summary">{chapter.summaryKeyPoints}</p>}
            {chapter.status === 'DONE' && <ChapterContentLink storyId={storyId} chapterIndex={chapter.index} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
