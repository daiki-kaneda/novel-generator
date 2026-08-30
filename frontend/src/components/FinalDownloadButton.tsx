import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { getFinalContent } from '../api/client';

/**
 * 完成原稿の署名付きURLを都度再発行して開く。
 * ステータスAPIの finalUrl は期限切れになり得るため使わない。
 */
export function FinalDownloadButton({ storyId }: { storyId: string }) {
  const [error, setError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => getFinalContent(storyId),
    onSuccess: (data) => {
      setError(undefined);
      window.open(data.contentUrl, '_blank', 'noopener,noreferrer');
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : '完成原稿の取得に失敗しました');
    },
  });

  return (
    <div>
      <button type="button" className="btn btn--primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? '発行中…' : '最終原稿をダウンロード'}
      </button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
