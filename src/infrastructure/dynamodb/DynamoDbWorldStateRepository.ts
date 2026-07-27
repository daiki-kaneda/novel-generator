import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  AtomicFact,
  WorldEntity,
  WorldStateSnapshot,
  WorldStateSnapshotProps,
  isFactActiveAt,
} from '../../domain/entities/WorldState';
import { WorldStateRepository } from '../../application/ports/WorldStateRepository';

const ENTITY_PREFIX = 'TKG#ENTITY#';
const FACT_PREFIX = 'TKG#FACT#';
const SNAP_PREFIX = 'TKG#SNAP#';
const BATCH_WRITE_CHUNK_SIZE = 25;

export class DynamoDbWorldStateRepository implements WorldStateRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async listEntities(storyId: string): Promise<WorldEntity[]> {
    const items = await this.queryByPrefix(storyId, ENTITY_PREFIX);
    return items.map((item) => this.fromEntityItem(item));
  }

  async upsertEntities(storyId: string, entities: WorldEntity[]): Promise<void> {
    for (const chunk of this.chunk(entities, BATCH_WRITE_CHUNK_SIZE)) {
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((entity) => ({
              PutRequest: {
                Item: {
                  storyId,
                  recordType: `${ENTITY_PREFIX}${entity.entityId}`,
                  ...entity,
                },
              },
            })),
          },
        }),
      );
    }
  }

  async listActiveFacts(storyId: string, asOfChapterIndex: number): Promise<AtomicFact[]> {
    const all = await this.listAllFacts(storyId);
    return all.filter((fact) => isFactActiveAt(fact, asOfChapterIndex));
  }

  async listAllFacts(storyId: string): Promise<AtomicFact[]> {
    const items = await this.queryByPrefix(storyId, FACT_PREFIX);
    return items.map((item) => this.fromFactItem(item));
  }

  async appendFacts(storyId: string, facts: AtomicFact[]): Promise<void> {
    for (const chunk of this.chunk(facts, BATCH_WRITE_CHUNK_SIZE)) {
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((fact) => ({
              PutRequest: {
                Item: {
                  storyId,
                  recordType: `${FACT_PREFIX}${fact.factId}`,
                  ...fact,
                },
              },
            })),
          },
        }),
      );
    }
  }

  async closeFacts(storyId: string, factIds: string[], closedAtChapter: number): Promise<void> {
    for (const factId of factIds) {
      const existing = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { storyId, recordType: `${FACT_PREFIX}${factId}` },
        }),
      );
      if (!existing.Item) {
        continue;
      }
      const fact = this.fromFactItem(existing.Item);
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            storyId,
            recordType: `${FACT_PREFIX}${factId}`,
            ...fact,
            validToChapter: closedAtChapter,
          },
        }),
      );
    }
  }

  async saveSnapshot(storyId: string, snapshot: WorldStateSnapshot): Promise<void> {
    const props = snapshot.toProps();
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          storyId,
          recordType: this.snapRecordType(props.afterChapterIndex),
          ...props,
        },
      }),
    );
  }

  async getSnapshot(storyId: string, afterChapterIndex: number): Promise<WorldStateSnapshot | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { storyId, recordType: this.snapRecordType(afterChapterIndex) },
      }),
    );
    if (!result.Item) {
      return null;
    }
    const { storyId: _s, recordType: _r, ...props } = result.Item;
    return WorldStateSnapshot.restore(props as WorldStateSnapshotProps);
  }

  async rollbackToSnapshot(storyId: string, afterChapterIndex: number): Promise<void> {
    const snapshot = await this.getSnapshot(storyId, afterChapterIndex);
    await this.clearWorldState(storyId);
    if (!snapshot) {
      return;
    }
    await this.upsertEntities(storyId, snapshot.entities);
    await this.appendFacts(storyId, snapshot.facts);
    await this.saveSnapshot(storyId, snapshot);
  }

  async clearWorldState(storyId: string): Promise<void> {
    const [entities, facts, snaps] = await Promise.all([
      this.queryByPrefix(storyId, ENTITY_PREFIX),
      this.queryByPrefix(storyId, FACT_PREFIX),
      this.queryByPrefix(storyId, SNAP_PREFIX),
    ]);
    const keys = [...entities, ...facts, ...snaps].map((item) => ({
      storyId,
      recordType: String(item.recordType),
    }));
    for (const chunk of this.chunk(keys, BATCH_WRITE_CHUNK_SIZE)) {
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: chunk.map((key) => ({
              DeleteRequest: { Key: key },
            })),
          },
        }),
      );
    }
  }

  private async queryByPrefix(
    storyId: string,
    prefix: string,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'storyId = :storyId AND begins_with(recordType, :prefix)',
        ExpressionAttributeValues: {
          ':storyId': storyId,
          ':prefix': prefix,
        },
      }),
    );
    return (result.Items ?? []) as Record<string, unknown>[];
  }

  private fromEntityItem(item: Record<string, unknown>): WorldEntity {
    return {
      entityId: String(item.entityId),
      name: String(item.name),
      kind: item.kind as WorldEntity['kind'],
      attributes: String(item.attributes ?? ''),
      updatedAtChapter: Number(item.updatedAtChapter ?? 0),
    };
  }

  private fromFactItem(item: Record<string, unknown>): AtomicFact {
    return {
      factId: String(item.factId),
      subject: String(item.subject),
      predicate: String(item.predicate),
      object: String(item.object),
      entityIds: Array.isArray(item.entityIds) ? (item.entityIds as string[]) : [],
      validFromChapter: Number(item.validFromChapter),
      validToChapter:
        item.validToChapter === undefined || item.validToChapter === null
          ? undefined
          : Number(item.validToChapter),
      sourceChapterIndex: Number(item.sourceChapterIndex),
      supersedes: Array.isArray(item.supersedes) ? (item.supersedes as string[]) : undefined,
    };
  }

  private snapRecordType(afterChapterIndex: number): string {
    return `${SNAP_PREFIX}${String(afterChapterIndex).padStart(4, '0')}`;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }
}
