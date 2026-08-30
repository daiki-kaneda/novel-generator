import type { ChapterStatus } from '../api/types';

/** 生成済みの章だけを対象に、現在章の前後 index を返す。 */
export function neighboringDoneChapters(
  chapters: Array<{ index: number; status: ChapterStatus }>,
  currentIndex: number,
): { prev?: number; next?: number } {
  const done = chapters
    .filter((chapter) => chapter.status === 'DONE')
    .map((chapter) => chapter.index)
    .sort((a, b) => a - b);
  const position = done.indexOf(currentIndex);
  if (position < 0) {
    return {};
  }
  return {
    prev: position > 0 ? done[position - 1] : undefined,
    next: position < done.length - 1 ? done[position + 1] : undefined,
  };
}
