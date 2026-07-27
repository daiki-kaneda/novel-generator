import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Story, StoryMetaProps } from '../../domain/entities/Story';
import { StoryMetadata, StoryMetadataProps } from '../../domain/entities/StoryMetadata';
import { Plan, PlanProps, PlanSnapshot, PlanSnapshotProps } from '../../domain/entities/Plan';
import { Chapter, ChapterProps } from '../../domain/entities/Chapter';
import { NotFoundError } from '../../domain/errors/DomainErrors';
import { StoryRepository } from '../../application/ports/StoryRepository';

const META_RECORD_TYPE = 'META';
const METADATA_RECORD_TYPE = 'METADATA';
const PLAN_RECORD_TYPE = 'PLAN';
const PLAN_SNAPSHOT_RECORD_PREFIX = 'PLAN#SNAP#';
const CHAPTER_RECORD_PREFIX = 'CHAPTER#';
const BATCH_WRITE_CHUNK_SIZE = 25;

/**
 * `StoryTable`（単一テーブル、PK=storyId / SK=recordType）へのアクセスをすべてここに閉じ込める。
 * ドメインエンティティとDynamoDBアイテムの相互変換もこのクラスの責務とする。
 */
export class DynamoDbStoryRepository implements StoryRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async createStory(story: Story): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toMetaItem(story.toProps()),
        ConditionExpression: 'attribute_not_exists(storyId)',
      }),
    );
  }

  async getStory(storyId: string): Promise<Story> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { storyId, recordType: META_RECORD_TYPE },
      }),
    );
    if (!result.Item) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }
    return Story.restore(this.fromMetaItem(result.Item));
  }

  async saveStory(story: Story): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toMetaItem(story.toProps()),
      }),
    );
  }

  async saveMetadata(storyId: string, metadata: StoryMetadata): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { storyId, recordType: METADATA_RECORD_TYPE, ...metadata.toProps() },
      }),
    );
  }

  async getMetadata(storyId: string): Promise<StoryMetadata> {
    const metadata = await this.findMetadata(storyId);
    if (!metadata) {
      throw new NotFoundError(`Metadata for story ${storyId} not found`);
    }
    return metadata;
  }

  async findMetadata(storyId: string): Promise<StoryMetadata | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { storyId, recordType: METADATA_RECORD_TYPE },
      }),
    );
    if (!result.Item) {
      return null;
    }
    const { storyId: _storyId, recordType: _recordType, ...metadataProps } = result.Item;
    return StoryMetadata.restore(metadataProps as StoryMetadataProps);
  }

  async savePlan(storyId: string, plan: Plan): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { storyId, recordType: PLAN_RECORD_TYPE, ...plan.toProps() },
      }),
    );
  }

  async getPlan(storyId: string): Promise<Plan> {
    const plan = await this.findPlan(storyId);
    if (!plan) {
      throw new NotFoundError(`Plan for story ${storyId} not found`);
    }
    return plan;
  }

  async findPlan(storyId: string): Promise<Plan | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { storyId, recordType: PLAN_RECORD_TYPE },
      }),
    );
    if (!result.Item) {
      return null;
    }
    const { storyId: _storyId, recordType: _recordType, ...planProps } = result.Item;
    return Plan.restore(planProps as PlanProps);
  }

  async savePlanSnapshot(storyId: string, snapshot: PlanSnapshot): Promise<void> {
    const props = snapshot.toProps();
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          storyId,
          recordType: this.planSnapshotRecordType(props.afterChapterIndex),
          afterChapterIndex: props.afterChapterIndex,
          trigger: props.trigger,
          recordedAt: props.recordedAt,
          plan: props.plan,
        },
      }),
    );
  }

  async listPlanSnapshots(storyId: string): Promise<PlanSnapshot[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'storyId = :storyId AND begins_with(recordType, :prefix)',
        ExpressionAttributeValues: {
          ':storyId': storyId,
          ':prefix': PLAN_SNAPSHOT_RECORD_PREFIX,
        },
      }),
    );
    return (result.Items ?? [])
      .map((item) => this.fromPlanSnapshotItem(item))
      .sort((a, b) => a.afterChapterIndex - b.afterChapterIndex);
  }

  async clearPlanSnapshots(storyId: string): Promise<void> {
    const existing = await this.listPlanSnapshots(storyId);
    if (existing.length === 0) {
      return;
    }
    for (let i = 0; i < existing.length; i += BATCH_WRITE_CHUNK_SIZE) {
      const chunk = existing.slice(i, i + BATCH_WRITE_CHUNK_SIZE);
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((snapshot) => ({
              DeleteRequest: {
                Key: {
                  storyId,
                  recordType: this.planSnapshotRecordType(snapshot.afterChapterIndex),
                },
              },
            })),
          },
        }),
      );
    }
  }

  async initializeChapters(storyId: string, chapters: Chapter[]): Promise<void> {
    const items = chapters.map((chapter) => this.toChapterItem(storyId, chapter));
    for (let i = 0; i < items.length; i += BATCH_WRITE_CHUNK_SIZE) {
      const chunk = items.slice(i, i + BATCH_WRITE_CHUNK_SIZE);
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((Item) => ({ PutRequest: { Item } })),
          },
        }),
      );
    }
  }

  async saveChapter(storyId: string, chapter: Chapter): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toChapterItem(storyId, chapter),
      }),
    );
  }

  async getChapter(storyId: string, index: number): Promise<Chapter> {
    const chapter = await this.findChapter(storyId, index);
    if (!chapter) {
      throw new NotFoundError(`Chapter ${index} for story ${storyId} not found`);
    }
    return chapter;
  }

  async findChapter(storyId: string, index: number): Promise<Chapter | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { storyId, recordType: this.chapterRecordType(index) },
      }),
    );
    if (!result.Item) {
      return null;
    }
    return this.fromChapterItem(result.Item);
  }

  async getChapters(storyId: string): Promise<Chapter[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'storyId = :storyId AND begins_with(recordType, :prefix)',
        ExpressionAttributeValues: { ':storyId': storyId, ':prefix': CHAPTER_RECORD_PREFIX },
      }),
    );
    return (result.Items ?? [])
      .map((item) => this.fromChapterItem(item))
      .sort((a, b) => a.index - b.index);
  }

  private chapterRecordType(index: number): string {
    return `${CHAPTER_RECORD_PREFIX}${String(index).padStart(4, '0')}`;
  }

  private planSnapshotRecordType(afterChapterIndex: number): string {
    return `${PLAN_SNAPSHOT_RECORD_PREFIX}${String(afterChapterIndex).padStart(4, '0')}`;
  }

  private toMetaItem(props: StoryMetaProps): Record<string, unknown> {
    return { ...props, storyId: props.storyId, recordType: META_RECORD_TYPE };
  }

  private fromMetaItem(item: Record<string, unknown>): StoryMetaProps {
    const { recordType: _recordType, ...rest } = item;
    return rest as unknown as StoryMetaProps;
  }

  private toChapterItem(storyId: string, chapter: Chapter): Record<string, unknown> {
    return {
      storyId,
      recordType: this.chapterRecordType(chapter.index),
      ...chapter.toProps(),
    };
  }

  private fromChapterItem(item: Record<string, unknown>): Chapter {
    const { storyId: _storyId, recordType: _recordType, ...rest } = item;
    return Chapter.restore(rest as unknown as ChapterProps);
  }

  private fromPlanSnapshotItem(item: Record<string, unknown>): PlanSnapshot {
    const {
      storyId: _storyId,
      recordType: _recordType,
      afterChapterIndex,
      trigger,
      recordedAt,
      plan,
    } = item;
    return PlanSnapshot.restore({
      afterChapterIndex: afterChapterIndex as number,
      trigger: trigger as PlanSnapshotProps['trigger'],
      recordedAt: recordedAt as string,
      plan: plan as PlanProps,
    });
  }
}
