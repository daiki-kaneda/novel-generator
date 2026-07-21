/**
 * 物語生成リクエストの投入先（SQS）を抽象化するポート。
 * SQS → EventBridge Pipe → Step Functions StartExecution という経路を
 * ユースケースからは意識させない。
 */
export interface RequestQueue {
  enqueueStoryRequest(storyId: string): Promise<void>;
}
