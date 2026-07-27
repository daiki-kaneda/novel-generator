/**
 * 章本文・最終テキストの保存先（S3）を抽象化するポート。
 */
export interface ChapterContentStorage {
  /** 章本文を保存し、参照キー（DynamoDBに保存する`s3Key`）を返す。 */
  saveChapterText(storyId: string, chapterIndex: number, text: string): Promise<string>;
  getChapterText(storyId: string, s3Key: string): Promise<string>;
  /** 章本文を削除する（Saga 補償・部分再生成用）。存在しなくても成功とする。 */
  deleteChapterText(storyId: string, s3Key: string): Promise<void>;

  /** 全章結合済みの最終テキストを保存し、参照キーを返す。 */
  saveFinalText(storyId: string, text: string): Promise<string>;
  /** 指定キーの署名付きダウンロードURLを発行する。 */
  createPresignedUrl(s3Key: string, expirySeconds: number): Promise<string>;
}
