import { StoryRepository } from '../ports/StoryRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';
import { NotificationSender } from '../ports/NotificationSender';

export interface FinalizeNovelInput {
  storyId: string;
}

export interface FinalizeNovelOutput {
  finalUrl: string;
}

/**
 * 最終承認後、全章の本文を結合して最終テキストを保存し、
 * 署名付きURLを発行してユーザーにメール通知する。
 */
export class FinalizeNovelUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
    private readonly notificationSender: NotificationSender,
    private readonly finalUrlExpirySeconds: number,
  ) {}

  async execute(input: FinalizeNovelInput): Promise<FinalizeNovelOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    const plan = await this.storyRepository.getPlan(input.storyId);
    const chapters = (await this.storyRepository.getChapters(input.storyId)).sort(
      (a, b) => a.index - b.index,
    );

    const chapterTexts: string[] = [];
    for (const chapter of chapters) {
      if (!chapter.s3Key) {
        throw new Error(`Chapter ${chapter.index} (${chapter.title}) has not been generated yet`);
      }
      const text = await this.chapterContentStorage.getChapterText(input.storyId, chapter.s3Key);
      chapterTexts.push(`## ${chapter.title}\n\n${text}`);
    }

    const finalText = [plan.summary, ...chapterTexts].join('\n\n---\n\n');
    const finalKey = await this.chapterContentStorage.saveFinalText(input.storyId, finalText);
    const finalUrl = await this.chapterContentStorage.createPresignedUrl(
      finalKey,
      this.finalUrlExpirySeconds,
    );

    story.complete(finalUrl);
    await this.storyRepository.saveStory(story);

    await this.notificationSender.sendCompletionEmail(story.request.userEmail, story.storyId, finalUrl);

    return { finalUrl };
  }
}
