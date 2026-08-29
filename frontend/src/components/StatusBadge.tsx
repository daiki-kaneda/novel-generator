import type { StoryStatus } from '../api/types';
import { isAwaitingApproval, isInProgress, STORY_STATUS_LABELS } from '../utils/statusLabels';

function toneFor(status: StoryStatus): 'progress' | 'waiting' | 'done' {
  if (status === 'COMPLETED') {
    return 'done';
  }
  if (isAwaitingApproval(status)) {
    return 'waiting';
  }
  return 'progress';
}

export function StatusBadge({ status }: { status: StoryStatus }) {
  const tone = toneFor(status);
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {isInProgress(status) && <span className="status-badge__spinner" aria-hidden="true" />}
      {STORY_STATUS_LABELS[status]}
    </span>
  );
}
