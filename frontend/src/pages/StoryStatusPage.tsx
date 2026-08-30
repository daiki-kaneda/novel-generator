import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { FinalDownloadButton } from '../components/FinalDownloadButton';
import { RevisionPanel } from '../components/RevisionPanel';
import { ChapterList } from '../components/ChapterList';
import { MetadataView } from '../components/MetadataView';
import { PlanView } from '../components/PlanView';
import { StatusBadge } from '../components/StatusBadge';
import { useStoryStatus } from '../hooks/useStoryStatus';
import { isAwaitingApproval } from '../utils/statusLabels';

export function StoryStatusPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const { data, error, isLoading, isFetching } = useStoryStatus(storyId);

  if (!storyId) {
    return <p className="field-error">storyIdが指定されていません。</p>;
  }

  if (isLoading) {
    return (
      <div className="page">
        <p className="page__loading">読み込み中…</p>
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="page">
        <h1>{notFound ? '物語が見つかりません' : '取得に失敗しました'}</h1>
        <p className="field-error">
          {notFound
            ? `storyId「${storyId}」の物語は見つかりませんでした。URLをご確認ください。`
            : error instanceof Error
              ? error.message
              : '不明なエラーが発生しました'}
        </p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const maxChapterIndex = data.plan?.chapters.length
    ? Math.max(...data.plan.chapters.map((c) => c.index))
    : undefined;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>物語の進行状況</h1>
          <p className="story-id">storyId: {data.storyId}</p>
        </div>
        <div className="page__header-status">
          <StatusBadge status={data.status} />
          {isFetching && <span className="page__refreshing">更新中…</span>}
        </div>
      </div>

      <div className="card">
        <h3>送信内容</h3>
        <dl className="kv-list">
          <dt>概要</dt>
          <dd>{data.request.overview}</dd>
          <dt>テーマ</dt>
          <dd>{data.request.theme}</dd>
          <dt>登場人物</dt>
          <dd>{data.request.characters}</dd>
          {data.request.tone && (
            <>
              <dt>トーン</dt>
              <dd>{data.request.tone}</dd>
            </>
          )}
          {data.request.setting && (
            <>
              <dt>舞台設定</dt>
              <dd>{data.request.setting}</dd>
            </>
          )}
          <dt>長さ</dt>
          <dd>{data.length === 'short' ? '短編' : '中編'}</dd>
        </dl>
      </div>

      {data.status === 'COMPLETED' && (
        <div className="card card--highlight">
          <h3>完成しました</h3>
          <p>最終原稿をダウンロードできます。リンクは都度発行するため、期限切れになってもここから再取得できます。</p>
          <FinalDownloadButton storyId={data.storyId} />
        </div>
      )}

      {data.status === 'FAILED' && (
        <div className="card card--danger">
          <h3>ワークフローが失敗しました</h3>
          <p>{data.failureReason ?? '生成ワークフローが失敗しました'}</p>
          <p className="approval-panel__hint">
            実行中ロックは解除済みです。
            {data.plan
              ? ' 残っている設定書・プラン・章は下に表示されます。指定章から再生成して復旧できます。'
              : ' 設定書またはプランの生成前に失敗したため、同じ内容で新規に送信し直してください。'}
          </p>
          {!data.plan && (
            <Link to="/" className="btn btn--primary">
              新しい物語を送信する
            </Link>
          )}
        </div>
      )}

      {(data.status === 'COMPLETED' || data.status === 'FAILED') &&
        data.plan &&
        data.plan.chapters.length > 0 && (
          <RevisionPanel storyId={data.storyId} chapters={data.plan.chapters} />
        )}

      {isAwaitingApproval(data.status) && data.taskStage && (
        <ApprovalPanel
          storyId={data.storyId}
          stage={data.taskStage}
          chapterIndex={data.currentChapterIndex}
          maxChapterIndex={maxChapterIndex}
        />
      )}

      {data.metadata && <MetadataView metadata={data.metadata} />}
      {data.plan && <PlanView plan={data.plan} />}
      <ChapterList storyId={data.storyId} chapters={data.chapters} currentChapterIndex={data.currentChapterIndex} />
    </div>
  );
}
