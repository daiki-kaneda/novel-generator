import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'novel-generator:recent-stories';
const MAX_ENTRIES = 20;

export interface RecentStory {
  storyId: string;
  overview: string;
  submittedAt: string;
}

function readStorage(): RecentStory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentStory[]) : [];
  } catch {
    return [];
  }
}

/**
 * 認証がないため、利用者が送信した物語を「自分のもの」として辿れるようにする
 * ブラウザローカルの便宜的な履歴。アクセス制御ではない（storyIdを知っていれば誰でも閲覧・承認できる）。
 */
export function useRecentStories() {
  const [stories, setStories] = useState<RecentStory[]>(() => readStorage());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    } catch {
      // localStorageが使えない環境（プライベートモード等）では履歴機能を諦める
    }
  }, [stories]);

  const addStory = useCallback((entry: RecentStory) => {
    setStories((prev) => [entry, ...prev.filter((s) => s.storyId !== entry.storyId)].slice(0, MAX_ENTRIES));
  }, []);

  const removeStory = useCallback((storyId: string) => {
    setStories((prev) => prev.filter((s) => s.storyId !== storyId));
  }, []);

  return { stories, addStory, removeStory };
}
