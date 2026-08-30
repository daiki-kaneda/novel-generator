import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '../api/client';
import type { ChapterContentOutput } from '../api/types';

/**
 * 指定章の本文を取得する。改訂で同じ index の本文が置き換わるため、
 * キャッシュは都度再取得する（`staleTime: 0`）。
 */
export function useChapterContent(storyId: string | undefined, chapterIndex: number | undefined) {
  return useQuery<ChapterContentOutput>({
    queryKey: ['chapter', storyId, chapterIndex],
    queryFn: () => getChapterContent(storyId as string, chapterIndex as number),
    enabled: Boolean(storyId) && Number.isInteger(chapterIndex) && (chapterIndex as number) >= 1,
    staleTime: 0,
  });
}
