import { Link } from 'react-router-dom';
import type { StoryStatusOutput } from '../api/types';
import { CHAPTER_STATUS_LABELS } from '../utils/statusLabels';

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
            {chapter.status === 'DONE' && (
              <div className="chapter-list__actions">
                <Link to={`/stories/${storyId}/chapters/${chapter.index}`} className="btn btn--secondary btn--small">
                  本文を読む
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
