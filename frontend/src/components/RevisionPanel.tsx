import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { startRevision } from '../api/client';
import type { ChapterOutline } from '../api/types';

interface RevisionPanelProps {
  storyId: string;
  chapters: ChapterOutline[];
}

/**
 * 完成後の改訂、およびプランがある失敗からの復旧。
 * POST /stories/{id}/revisions で指定章以降を再生成する。
 */
export function RevisionPanel({ storyId, chapters }: RevisionPanelProps) {
  const queryClient = useQueryClient();
  const lastIndex = chapters[chapters.length - 1]?.index ?? 1;
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [rewriteFromChapterIndex, setRewriteFromChapterIndex] = useState(String(lastIndex));

  const revision = useMutation({
    mutationFn: async () => {
      const trimmed = feedback.trim();
      if (!trimmed) {
        throw new Error('修正してほしい点を入力してください');
      }
      const fromIndex = Number(rewriteFromChapterIndex);
      if (!Number.isInteger(fromIndex) || fromIndex < 1) {
        throw new Error('再生成を開始する章を選んでください');
      }
      return startRevision(storyId, { rewriteFromChapterIndex: fromIndex, feedback: trimmed });
    },
    onSuccess: () => {
      setFeedback('');
      setConfirming(false);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
      void queryClient.invalidateQueries({ queryKey: ['chapter', storyId] });
    },
  });

  const selectedIndex = Number(rewriteFromChapterIndex);
  const selectedTitle = chapters.find((c) => c.index === selectedIndex)?.title;

  return (
    <div className="card">
      <h3>ここから書き直す</h3>
      <p className="approval-panel__hint">
        指定した章から最終章までを再生成します。それより前の章は残ります。開始するとワークフローが動き出し、最終承認が必要な設定なら再び承認待ちになります。
      </p>

      {!open && (
        <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
          部分再生成を始める
        </button>
      )}

      {open && (
        <form
          className="approval-panel__reject-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirming) {
              setConfirming(true);
              return;
            }
            revision.mutate();
          }}
        >
          <label htmlFor="rewriteFromChapterIndex">再生成を開始する章</label>
          <select
            id="rewriteFromChapterIndex"
            value={rewriteFromChapterIndex}
            onChange={(event) => {
              setRewriteFromChapterIndex(event.target.value);
              setConfirming(false);
            }}
          >
            {chapters.map((chapter) => (
              <option key={chapter.index} value={chapter.index}>
                第{chapter.index}章 {chapter.title}
              </option>
            ))}
          </select>

          <label htmlFor="revision-feedback">修正してほしい点（必須）</label>
          <textarea
            id="revision-feedback"
            required
            rows={4}
            value={feedback}
            onChange={(event) => {
              setFeedback(event.target.value);
              setConfirming(false);
            }}
            placeholder="例: 第3章の結末が急すぎる。もう少し余韻を残してほしい"
          />

          {confirming && (
            <p className="approval-panel__hint">
              第{selectedIndex}章
              {selectedTitle ? `「${selectedTitle}」` : ''}
              以降を再生成します。よろしいですか？
            </p>
          )}

          <div className="approval-panel__actions">
            <button type="submit" className="btn btn--primary" disabled={revision.isPending}>
              {revision.isPending ? '開始中…' : confirming ? '再生成を開始する' : '内容を確認する'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setOpen(false);
                setConfirming(false);
              }}
              disabled={revision.isPending}
            >
              キャンセル
            </button>
          </div>

          {revision.isError && (
            <p className="field-error">
              {revision.error instanceof Error ? revision.error.message : '再生成の開始に失敗しました'}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
