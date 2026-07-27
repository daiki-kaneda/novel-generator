import {
  AtomicFact,
  WorldEntity,
  WorldStateSnapshot,
} from '../../domain/entities/WorldState';

/**
 * 時間的知識グラフ（TKG）の永続化ポート。
 * 章横断のエンティティ・アトミック事実・スナップショットを扱う。
 */
export interface WorldStateRepository {
  listEntities(storyId: string): Promise<WorldEntity[]>;
  upsertEntities(storyId: string, entities: WorldEntity[]): Promise<void>;

  /** 指定章時点で有効な事実を返す。 */
  listActiveFacts(storyId: string, asOfChapterIndex: number): Promise<AtomicFact[]>;
  listAllFacts(storyId: string): Promise<AtomicFact[]>;
  appendFacts(storyId: string, facts: AtomicFact[]): Promise<void>;
  /** 既存事実の validToChapter を更新する（supersede 用）。 */
  closeFacts(storyId: string, factIds: string[], closedAtChapter: number): Promise<void>;

  saveSnapshot(storyId: string, snapshot: WorldStateSnapshot): Promise<void>;
  getSnapshot(storyId: string, afterChapterIndex: number): Promise<WorldStateSnapshot | null>;
  /**
   * afterChapterIndex より後の事実・エンティティ更新・スナップショットを削除し、
   * 指定スナップショット状態へ戻す。
   */
  rollbackToSnapshot(storyId: string, afterChapterIndex: number): Promise<void>;
  /** ストーリー全体の TKG を削除する（フル再生成時）。 */
  clearWorldState(storyId: string): Promise<void>;
}
