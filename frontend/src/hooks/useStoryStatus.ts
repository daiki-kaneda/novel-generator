import { useQuery } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { getStoryStatus } from '../api/client';
import type { StoryStatus, StoryStatusOutput } from '../api/types';

/** 生成が進行中の間の更新間隔。 */
const ACTIVE_POLL_INTERVAL_MS = 3_000;
/** 承認待ちの間の更新間隔（人間の操作待ちなので緩める）。 */
const AWAITING_POLL_INTERVAL_MS = 15_000;

function pollIntervalFor(status: StoryStatus | undefined): number | false {
  if (!status || status === 'COMPLETED') {
    return false;
  }
  if (status.startsWith('AWAITING_')) {
    return AWAITING_POLL_INTERVAL_MS;
  }
  return ACTIVE_POLL_INTERVAL_MS;
}

/**
 * 物語の進行状況を状態に応じた間隔でポーリングする。
 * 完了後は自動停止し、タブが非表示の間はポーリングを止める（`refetchIntervalInBackground: false`）。
 */
export function useStoryStatus(storyId: string | undefined) {
  return useQuery<StoryStatusOutput>({
    queryKey: ['story', storyId],
    queryFn: () => getStoryStatus(storyId as string),
    enabled: Boolean(storyId),
    refetchInterval: (query: Query<StoryStatusOutput>) => pollIntervalFor(query.state.data?.status),
    refetchIntervalInBackground: false,
  });
}
