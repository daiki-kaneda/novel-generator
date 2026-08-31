import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listMyStories } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export function MyStoriesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['myStories'],
    queryFn: listMyStories,
  });

  return (
    <div className="page">
      <h1>マイストーリー</h1>
      <p className="page__lead">これまでに送信した物語の一覧です。</p>

      {isLoading && <p>読み込み中…</p>}
      {error && <p className="field-error">一覧の取得に失敗しました。時間をおいて再度お試しください。</p>}

      {data && data.stories.length === 0 && (
        <div className="card">
          <p>まだ物語を送信していません。</p>
          <Link to="/" className="btn btn--primary">
            物語を送信する
          </Link>
        </div>
      )}

      {data && data.stories.length > 0 && (
        <ul className="my-stories">
          {data.stories.map((story) => (
            <li key={story.storyId} className="my-stories__item">
              <Link to={`/stories/${story.storyId}`} className="my-stories__link">
                <span className="my-stories__overview">{story.overview}</span>
                <span className="my-stories__meta">
                  {story.theme} / {new Date(story.createdAt).toLocaleString('ja-JP')}
                </span>
              </Link>
              <StatusBadge status={story.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
