/** LLMが提案する、章単位の改訂指示。 */
export interface ChapterRevisionInstruction {
  chapterIndex: number;
  instruction: string;
}

/**
 * 最終承認が拒否された際、どの章を改訂対象にするかを決めるルール。
 *
 * 実際に「どの章のどの部分を直すべきか」の創造的な判断はLLM（infrastructure層）が行うが、
 * その提案が物語の実際の章構成と整合しているかの検証・正規化はドメインの責務として
 * ここに閉じ込める（存在しない章番号の除外、空指示の除外、重複時の統合）。
 */
export class RevisionScopePolicy {
  static resolve(
    proposedInstructions: readonly ChapterRevisionInstruction[],
    existingChapterIndexes: readonly number[],
  ): ChapterRevisionInstruction[] {
    const validIndexes = new Set(existingChapterIndexes);
    const byIndex = new Map<number, ChapterRevisionInstruction>();

    for (const item of proposedInstructions) {
      if (!validIndexes.has(item.chapterIndex)) {
        continue;
      }
      if (!item.instruction || item.instruction.trim().length === 0) {
        continue;
      }
      byIndex.set(item.chapterIndex, item);
    }

    return Array.from(byIndex.values()).sort((a, b) => a.chapterIndex - b.chapterIndex);
  }
}
