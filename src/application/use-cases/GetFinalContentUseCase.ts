import { NotFoundError, ValidationError } from '../../domain/errors/DomainErrors';
import { StoryRepository } from '../ports/StoryRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';

export interface GetFinalContentInput {
  storyId: string;
  callerId: string;
}

export interface GetFinalContentOutput {
  storyId: string;
  contentUrl: string;
  expiresInSeconds: number;
}

/**
 * 完成原稿への署名付きURLを都度発行する。
 * Story に期限付きURLを永続化しない（ロールセッションより先に切れるため）。
 * 再発行は COMPLETED のときだけ行い、改訂中の旧 final.txt を完成稿として出さない。
 */
export class GetFinalContentUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
    private readonly urlExpirySeconds: number,
  ) {}

  async execute(input: GetFinalContentInput): Promise<GetFinalContentOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.assertOwnedBy(input.callerId);
    const finalKey = story.resolveFinalKey();
    if (!finalKey) {
      if (story.status !== 'COMPLETED') {
        throw new ValidationError(
          `Story ${input.storyId} is not completed (status: ${story.status})`,
        );
      }
      throw new NotFoundError(`Story ${input.storyId} has no final manuscript`);
    }

    const contentUrl = await this.chapterContentStorage.createPresignedUrl(
      finalKey,
      this.urlExpirySeconds,
    );

    return {
      storyId: story.storyId,
      contentUrl,
      expiresInSeconds: this.urlExpirySeconds,
    };
  }
}
