import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  MonthlyUsage,
  RecordUsageInput,
  UsageAccountRepository,
} from '../../application/ports/UsageAccountRepository';
import { normalizeAccountEmail, PlanTier, resolvePlanTier } from '../../domain/value-objects/UsagePlan';

const PROFILE_RECORD_TYPE = 'PROFILE';
const MONTHLY_RECORD_PREFIX = 'MONTHLY#';

/**
 * `UsageTable`（PK=accountEmail / SK=recordType）へのアクセスをすべてここに閉じ込める。
 * - `PROFILE`: プラン割当（決済連携がないため、運用者が手動で書き込むまでは全員 free）。
 * - `MONTHLY#<yyyy-MM>`: 当月のコスト・トークン使用量の集計（ADDで加算するため並行書き込みに安全）。
 * 章本文などと異なりStory単位ではなくアカウント（メールアドレス）単位のテーブルなので、
 * StoryRepositoryとは別テーブル・別リポジトリとして分離している。
 */
export class DynamoDbUsageAccountRepository implements UsageAccountRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getPlanTier(userEmail: string): Promise<PlanTier> {
    const accountEmail = normalizeAccountEmail(userEmail);
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { accountEmail, recordType: PROFILE_RECORD_TYPE },
      }),
    );
    return resolvePlanTier(result.Item?.planTier);
  }

  async getMonthlyUsage(userEmail: string, yearMonth: string): Promise<MonthlyUsage> {
    const accountEmail = normalizeAccountEmail(userEmail);
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { accountEmail, recordType: this.monthlyRecordType(yearMonth) },
      }),
    );
    return {
      yearMonth,
      totalCostUsd: (result.Item?.totalCostUsd as number | undefined) ?? 0,
      totalInputTokens: (result.Item?.totalInputTokens as number | undefined) ?? 0,
      totalOutputTokens: (result.Item?.totalOutputTokens as number | undefined) ?? 0,
    };
  }

  async recordUsage(userEmail: string, input: RecordUsageInput): Promise<void> {
    const accountEmail = normalizeAccountEmail(userEmail);
    const yearMonth = new Date().toISOString().slice(0, 7);
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { accountEmail, recordType: this.monthlyRecordType(yearMonth) },
        UpdateExpression:
          'SET updatedAt = :updatedAt ADD totalCostUsd :costUsd, totalInputTokens :inputTokens, totalOutputTokens :outputTokens',
        ExpressionAttributeValues: {
          ':updatedAt': new Date().toISOString(),
          ':costUsd': input.costUsd,
          ':inputTokens': input.inputTokens,
          ':outputTokens': input.outputTokens,
        },
      }),
    );
  }

  private monthlyRecordType(yearMonth: string): string {
    return `${MONTHLY_RECORD_PREFIX}${yearMonth}`;
  }
}
