import { Story } from '../../domain/entities/Story';
import { StoryMetadata } from '../../domain/entities/StoryMetadata';
import { Plan, PlanSnapshot } from '../../domain/entities/Plan';
import { Chapter } from '../../domain/entities/Chapter';

/**
 * Story/Metadata/Plan/Chapterの永続化を抽象化するポート。
 * DynamoDB単一テーブルのアクセスパターンなど、具体的な実装の詳細はこのインターフェースの
 * 背後（infrastructure層）に隠蔽する。
 */
export interface StoryRepository {
  createStory(story: Story): Promise<void>;
  getStory(storyId: string): Promise<Story>;
  saveStory(story: Story): Promise<void>;

  saveMetadata(storyId: string, metadata: StoryMetadata): Promise<void>;
  getMetadata(storyId: string): Promise<StoryMetadata>;
  findMetadata(storyId: string): Promise<StoryMetadata | null>;

  savePlan(storyId: string, plan: Plan): Promise<void>;
  getPlan(storyId: string): Promise<Plan>;
  findPlan(storyId: string): Promise<Plan | null>;

  /** Plan 変遷スナップショットを保存する（同一 afterChapterIndex は上書き）。 */
  savePlanSnapshot(storyId: string, snapshot: PlanSnapshot): Promise<void>;
  /** Plan 変遷スナップショットを afterChapterIndex 昇順で返す。 */
  listPlanSnapshots(storyId: string): Promise<PlanSnapshot[]>;
  /** Plan 再生成時に旧スナップショットをすべて削除する。 */
  clearPlanSnapshots(storyId: string): Promise<void>;

  /** プラン（再）生成時に、章構成に合わせて章レコード一式を初期化（上書き）する。 */
  initializeChapters(storyId: string, chapters: Chapter[]): Promise<void>;
  saveChapter(storyId: string, chapter: Chapter): Promise<void>;
  getChapter(storyId: string, index: number): Promise<Chapter>;
  findChapter(storyId: string, index: number): Promise<Chapter | null>;
  /** 全章をindex昇順で返す。 */
  getChapters(storyId: string): Promise<Chapter[]>;
}
