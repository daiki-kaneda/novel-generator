import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { decideChapterApproval } from '../api/client';
import type { ChapterGenerationError } from '../api/types';

interface ChapterRecoveryPanelProps {
  storyId: string;
  chapterIndex: number;
  lastChapterError?: ChapterGenerationError;
}

/**
 * 章生成が自動リトライ後も失敗したときの回復UI。
 * 通常の「生成完了の承認」とは別コンポーネントにし、承認して先に進む操作を出さない。
 */
export function ChapterRecoveryPanel({
  storyId,
  chapterIndex,
  lastChapterError,
}: ChapterRecoveryPanelProps) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [mode, setMode] = useState<'idle' | 'retrying' | 'aborting'>('idle');

  const retry = useMutation({
    mutationFn: async () => {
      if (feedback.trim().length === 0) {
        throw new Error('再生成するには、直してほしい点を入力してください');
      }
      return decideChapterApproval(storyId, chapterIndex, {
        approved: false,
        feedback: feedback.trim(),
      });
    },
    onSuccess: () => {
      setFeedback('');
      setMode('idle');
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });

  const abort = useMutation({
    mutationFn: () =>
      decideChapterApproval(storyId, chapterIndex, {
        approved: false,
        abort: true,
      }),
    onSuccess: () => {
      setMode('idle');
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });

  const busy = retry.isPending || abort.isPending;
  const error = retry.error ?? abort.error;
  const contradictions = lastChapterError?.contradictions ?? [];

  return (
    <div className="card card--danger">
      <h3>第{chapterIndex}章の生成に失敗しました</h3>
      <p className="approval-panel__hint">
        この章はまだ未生成です。承認しても先の章へは進めません。失敗の内容を確認し、修正の指示を出して再生成してください。
      </p>

      <div className="recovery-error">
        <p className="recovery-error__message">
          {lastChapterError?.message ??
            `第${chapterIndex}章の本文生成に失敗しました。展開を変える指示を出して再生成してください。`}
        </p>
        {contradictions.length > 0 && (
          <ul className="recovery-error__list">
            {contradictions.map((item) => (
              <li key={`${item.newFact}-${item.conflictingFact}`}>
                新しい事実「{item.newFact}」は、既存の事実「{item.conflictingFact}」と矛盾します（
                {item.reason}）
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === 'idle' && (
        <div className="approval-panel__actions">
          <button type="button" className="btn btn--primary" onClick={() => setMode('retrying')} disabled={busy}>
            指示を出して再生成する
          </button>
          <button type="button" className="btn btn--danger-outline" onClick={() => setMode('aborting')} disabled={busy}>
            生成を中止する
          </button>
        </div>
      )}

      {mode === 'retrying' && (
        <form
          className="approval-panel__reject-form"
          onSubmit={(event) => {
            event.preventDefault();
            retry.mutate();
          }}
        >
          <label htmlFor="recovery-feedback">修正してほしい点（必須）</label>
          <textarea
            id="recovery-feedback"
            required
            rows={4}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="例: 剣を失った設定と矛盾しないよう、別の武器を使う展開にしてほしい"
          />
          <div className="approval-panel__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {retry.isPending ? '送信中…' : '再生成する'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setMode('idle')} disabled={busy}>
              キャンセル
            </button>
          </div>
        </form>
      )}

      {mode === 'aborting' && (
        <div>
          <p className="approval-panel__hint">
            この物語の生成ワークフローを失敗として終了します。すでにできている設定書・プラン・章は残り、そこから部分再生成できます。
          </p>
          <div className="approval-panel__actions">
            <button type="button" className="btn btn--danger" onClick={() => abort.mutate()} disabled={busy}>
              {abort.isPending ? '中止しています…' : '生成を中止する'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setMode('idle')} disabled={busy}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {error && <p className="field-error">{error instanceof Error ? error.message : '送信に失敗しました'}</p>}
    </div>
  );
}
