import { NotFoundError, ValidationError } from '../../domain/errors/DomainErrors';
import { StoryRepository } from '../ports/StoryRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';

export interface GetChapterContentInput {
  storyId: string;
  chapterIndex: number;
}

export interface GetChapterContentOutput {
  storyId: string;
  chapterIndex: number;
  title: string;
  /** アプリ内リーダー用の本文。S3をブラウザから直接読ませない。 */
  content: string;
  contentUrl: string;
  expiresInSeconds: number;
}

/**
 * 指定章の本文と、任意の署名付きURLを返す。
 * 本文はアプリ内リーダー向け。URLは別タブや保存用。
 */
export class GetChapterContentUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
    private readonly urlExpirySeconds: number,
  ) {}

  async execute(input: GetChapterContentInput): Promise<GetChapterContentOutput> {
    if (!Number.isInteger(input.chapterIndex) || input.chapterIndex < 1) {
      throw new ValidationError('chapterIndex must be a positive integer');
    }

    await this.storyRepository.getStory(input.storyId);
    const chapter = await this.storyRepository.getChapter(input.storyId, input.chapterIndex);

    if (!chapter.s3Key) {
      throw new NotFoundError(
        `Chapter ${input.chapterIndex} for story ${input.storyId} has no generated content yet`,
      );
    }

    const [content, contentUrl] = await Promise.all([
      this.chapterContentStorage.getChapterText(input.storyId, chapter.s3Key),
      this.chapterContentStorage.createPresignedUrl(chapter.s3Key, this.urlExpirySeconds),
    ]);

    return {
      storyId: input.storyId,
      chapterIndex: chapter.index,
      title: chapter.title,
      content,
      contentUrl,
      expiresInSeconds: this.urlExpirySeconds,
    };
  }
}
