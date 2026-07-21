import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ChapterContentStorage } from '../../application/ports/ChapterContentStorage';

/**
 * 章本文・最終テキストをS3に保存し、署名付きURLを発行するアダプタ。
 */
export class S3ChapterContentStorage implements ChapterContentStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
  ) {}

  async saveChapterText(storyId: string, chapterIndex: number, text: string): Promise<string> {
    const key = this.chapterKey(storyId, chapterIndex);
    await this.putText(key, text);
    return key;
  }

  async getChapterText(_storyId: string, s3Key: string): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: s3Key }),
    );
    if (!result.Body) {
      throw new Error(`Object body is empty for key ${s3Key}`);
    }
    return await result.Body.transformToString('utf-8');
  }

  async saveFinalText(storyId: string, text: string): Promise<string> {
    const key = this.finalKey(storyId);
    await this.putText(key, text);
    return key;
  }

  async createPresignedUrl(s3Key: string, expirySeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: s3Key });
    return getSignedUrl(this.client, command, { expiresIn: expirySeconds });
  }

  private async putText(key: string, text: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: text,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
  }

  private chapterKey(storyId: string, chapterIndex: number): string {
    return `stories/${storyId}/chapters/${String(chapterIndex).padStart(4, '0')}.txt`;
  }

  private finalKey(storyId: string): string {
    return `stories/${storyId}/final.txt`;
  }
}
