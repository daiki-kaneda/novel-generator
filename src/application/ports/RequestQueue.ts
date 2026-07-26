/**
 * 物語生成リクエストの投入先を抽象化するポート。
 * ユースケースはキューの具体的な配送経路を意識しない。
 */
export interface RequestQueue {
  enqueueStoryRequest(storyId: string): Promise<void>;
}
