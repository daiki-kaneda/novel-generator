import { Link } from 'react-router-dom';
import type { RecentStory } from '../hooks/useRecentStories';

export function RecentStoriesList({
  stories,
  onRemove,
}: {
  stories: RecentStory[];
  onRemove: (storyId: string) => void;
}) {
  if (stories.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3>このブラウザで送信した物語</h3>
      <p className="approval-panel__hint">
        認証機能がないため、これはこの端末だけに保存された履歴です。storyIdを知っていれば誰でも閲覧・承認できるため、URLの共有範囲に注意してください。
      </p>
      <ul className="recent-stories">
        {stories.map((story) => (
          <li key={story.storyId} className="recent-stories__item">
            <Link to={`/stories/${story.storyId}`} className="recent-stories__link">
              <span className="recent-stories__overview">{story.overview}</span>
              <span className="recent-stories__meta">
                {new Date(story.submittedAt).toLocaleString('ja-JP')} / {story.storyId}
              </span>
            </Link>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => onRemove(story.storyId)}
              aria-label="履歴から削除"
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
