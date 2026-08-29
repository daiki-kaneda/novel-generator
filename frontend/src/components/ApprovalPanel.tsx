import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  decideChapterApproval,
  decideFinalApproval,
  decideMetadataApproval,
  decidePlanApproval,
} from '../api/client';
import type { ApprovalStage } from '../api/types';
import { APPROVAL_STAGE_LABELS } from '../utils/statusLabels';

interface ApprovalPanelProps {
  storyId: string;
  stage: ApprovalStage;
  /** stageが`chapter`のとき対象章のindex。 */
  chapterIndex?: number;
  /** stageが`final`のとき、部分再生成の開始章の選択肢として使う最大章番号。 */
  maxChapterIndex?: number;
}

/**
 * 承認待ち（`AWAITING_*`）のときに表示する承認/拒否フォーム。
 * 4つの承認段階（metadata/plan/chapter/final）を1つのUIに統一する。
 */
export function ApprovalPanel({ storyId, stage, chapterIndex, maxChapterIndex }: ApprovalPanelProps) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [rewriteFromChapterIndex, setRewriteFromChapterIndex] = useState<string>('');
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');

  const decide = useMutation({
    mutationFn: async (approved: boolean) => {
      if (!approved && feedback.trim().length === 0) {
        throw new Error('拒否する場合は修正してほしい点を入力してください');
      }
      if (stage === 'metadata') {
        return decideMetadataApproval(storyId, { approved, feedback: feedback.trim() || undefined });
      }
      if (stage === 'plan') {
        return decidePlanApproval(storyId, { approved, feedback: feedback.trim() || undefined });
      }
      if (stage === 'chapter') {
        if (chapterIndex === undefined) {
          throw new Error('章番号が不明なため承認できません');
        }
        return decideChapterApproval(storyId, chapterIndex, { approved, feedback: feedback.trim() || undefined });
      }
      return decideFinalApproval(storyId, {
        approved,
        feedback: feedback.trim() || undefined,
        rewriteFromChapterIndex: rewriteFromChapterIndex ? Number(rewriteFromChapterIndex) : undefined,
      });
    },
    onSuccess: () => {
      setFeedback('');
      setRewriteFromChapterIndex('');
      setMode('idle');
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });

  return (
    <div className="card card--highlight">
      <h3>{APPROVAL_STAGE_LABELS[stage]}の承認待ち</h3>
      <p className="approval-panel__hint">
        内容を確認し、問題なければ承認してください。修正が必要な場合は拒否して修正点を伝えると、フィードバックを反映して再生成されます。
      </p>

      {mode === 'idle' && (
        <div className="approval-panel__actions">
          <button type="button" className="btn btn--primary" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
            承認する
          </button>
          <button type="button" className="btn btn--danger-outline" onClick={() => setMode('rejecting')} disabled={decide.isPending}>
            拒否する
          </button>
        </div>
      )}

      {mode === 'rejecting' && (
        <form
          className="approval-panel__reject-form"
          onSubmit={(event) => {
            event.preventDefault();
            decide.mutate(false);
          }}
        >
          <label htmlFor="feedback">修正してほしい点（必須）</label>
          <textarea
            id="feedback"
            required
            rows={4}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="例: もっと不穏な雰囲気にしてほしい／第3章の展開が急すぎる"
          />

          {stage === 'final' && (
            <>
              <label htmlFor="rewriteFromChapterIndex">
                再生成を開始する章番号（省略時は最終章のみ再生成）
                {maxChapterIndex ? `（1〜${maxChapterIndex}）` : ''}
              </label>
              <input
                id="rewriteFromChapterIndex"
                type="number"
                min={1}
                max={maxChapterIndex}
                value={rewriteFromChapterIndex}
                onChange={(event) => setRewriteFromChapterIndex(event.target.value)}
              />
            </>
          )}

          <div className="approval-panel__actions">
            <button type="submit" className="btn btn--danger" disabled={decide.isPending}>
              {decide.isPending ? '送信中…' : '拒否として送信'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setMode('idle')} disabled={decide.isPending}>
              キャンセル
            </button>
          </div>
        </form>
      )}

      {decide.isError && <p className="field-error">{decide.error instanceof Error ? decide.error.message : '送信に失敗しました'}</p>}
    </div>
  );
}
