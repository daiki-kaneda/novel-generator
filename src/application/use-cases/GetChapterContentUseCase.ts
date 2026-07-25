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
  contentUrl: string;
}

/**
 * 指定章の本文への署名付きURLを返す。
 * 章承認時にユーザーが本文を読んで判断するために使う。
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

    const contentUrl = await this.chapterContentStorage.createPresignedUrl(
      chapter.s3Key,
      this.urlExpirySeconds,
    );

    return {
      storyId: input.storyId,
      chapterIndex: chapter.index,
      title: chapter.title,
      contentUrl,
    };
  }
}
