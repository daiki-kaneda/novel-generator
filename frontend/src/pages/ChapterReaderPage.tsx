import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { useChapterContent } from '../hooks/useChapterContent';
import { useStoryStatus } from '../hooks/useStoryStatus';
import { neighboringDoneChapters } from '../utils/chapterNav';

function downloadChapterText(chapterIndex: number, title: string, content: string) {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `第${chapterIndex}章_${safeTitle}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ChapterReaderPage() {
  const { storyId, chapterIndex: rawIndex } = useParams<{ storyId: string; chapterIndex: string }>();
  const chapterIndex = Number(rawIndex);
  const validIndex = Number.isInteger(chapterIndex) && chapterIndex >= 1;
  const story = useStoryStatus(storyId);
  const chapter = useChapterContent(storyId, validIndex ? chapterIndex : undefined);

  if (!storyId || !validIndex) {
    return <p className="field-error">章の指定が正しくありません。</p>;
  }

  if (chapter.isLoading) {
    return (
      <div className="page">
        <p className="page__loading">本文を読み込み中…</p>
      </div>
    );
  }

  if (chapter.error) {
    const notFound = chapter.error instanceof ApiError && chapter.error.status === 404;
    return (
      <div className="page">
        <h1>{notFound ? '本文がまだありません' : '本文の取得に失敗しました'}</h1>
        <p className="field-error">
          {notFound
            ? `第${chapterIndex}章の本文はまだ生成されていません。`
            : chapter.error instanceof Error
              ? chapter.error.message
              : '不明なエラーが発生しました'}
        </p>
        <Link to={`/stories/${storyId}`} className="btn btn--secondary">
          進行状況に戻る
        </Link>
      </div>
    );
  }

  if (!chapter.data) {
    return null;
  }

  const neighbors = neighboringDoneChapters(story.data?.chapters ?? [], chapterIndex);
  const awaitingThisChapter =
    story.data?.status === 'AWAITING_CHAPTER_APPROVAL' &&
    story.data.taskStage === 'chapter' &&
    story.data.currentChapterIndex === chapterIndex;

  return (
    <div className="page chapter-reader">
      <div className="chapter-reader__nav">
        <Link to={`/stories/${storyId}`} className="btn btn--secondary">
          進行状況に戻る
        </Link>
        <div className="chapter-reader__neighbors">
          {neighbors.prev !== undefined ? (
            <Link to={`/stories/${storyId}/chapters/${neighbors.prev}`} className="btn btn--secondary">
              前の章
            </Link>
          ) : null}
          {neighbors.next !== undefined ? (
            <Link to={`/stories/${storyId}/chapters/${neighbors.next}`} className="btn btn--secondary">
              次の章
            </Link>
          ) : null}
        </div>
      </div>

      <article className="chapter-reader__article">
        <p className="chapter-reader__kicker">第{chapter.data.chapterIndex}章</p>
        <h1>{chapter.data.title}</h1>
        <div className="chapter-reader__body">{chapter.data.content}</div>
      </article>

      <div className="chapter-reader__actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => downloadChapterText(chapter.data.chapterIndex, chapter.data.title, chapter.data.content)}
        >
          テキストを保存
        </button>
        <a
          className="btn btn--secondary"
          href={chapter.data.contentUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          別タブで開く
        </a>
      </div>

      {awaitingThisChapter && (
        <ApprovalPanel storyId={storyId} stage="chapter" chapterIndex={chapterIndex} showReadLink={false} />
      )}
    </div>
  );
}
