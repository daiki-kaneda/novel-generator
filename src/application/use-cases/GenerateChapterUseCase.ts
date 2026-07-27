import { StoryRepository } from '../ports/StoryRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';
import { NovelTextGenerator } from '../ports/NovelTextGenerator';
import { WorldStateRepository } from '../ports/WorldStateRepository';
import { Plan, PlanSnapshot, RoughBeat } from '../../domain/entities/Plan';
import { StoryMetadataProps } from '../../domain/entities/StoryMetadata';
import {
  AtomicFact,
  WorldEntity,
  WorldStateSnapshot,
  createFactId,
} from '../../domain/entities/WorldState';
import { ContradictionDetectedError } from '../../domain/errors/DomainErrors';
import { StoryLength } from '../../domain/value-objects/StoryLength';

export interface GenerateChapterInput {
  storyId: string;
  chapterIndex: number;
  /**
   * 章承認拒否時のフィードバック。空文字・未指定の場合は通常の生成、
   * 指定時は改訂として扱う。
   */
  revisionFeedback?: string;
}

/**
 * 指定された1章の本文を生成する。
 * Expand → Write → Extract/FACTTRACK → Realign の順で処理する。
 */
export class GenerateChapterUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
    private readonly novelTextGenerator: NovelTextGenerator,
    private readonly worldStateRepository: WorldStateRepository,
  ) {}

  async execute(input: GenerateChapterInput): Promise<void> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.moveTo('CHAPTERS_GENERATING');
    await this.storyRepository.saveStory(story);

    const metadata = await this.storyRepository.getMetadata(input.storyId);
    const plan = await this.storyRepository.getPlan(input.storyId);
    const chapter = await this.storyRepository.getChapter(input.storyId, input.chapterIndex);

    const feedback = input.revisionFeedback?.trim();
    if (feedback) {
      chapter.requestRevision(feedback);
    }

    const planOutline = plan.chapters.find((outline) => outline.index === input.chapterIndex);
    if (!planOutline) {
      throw new Error(
        `Plan does not contain chapter index ${input.chapterIndex} for story ${input.storyId}`,
      );
    }

    const metadataProps = metadata.toProps();
    const callContext = { storyId: input.storyId, chapterIndex: input.chapterIndex };
    const activeFacts = await this.worldStateRepository.listActiveFacts(
      input.storyId,
      input.chapterIndex,
    );
    const knownEntities = await this.worldStateRepository.listEntities(input.storyId);

    const previousChapter =
      input.chapterIndex > 1
        ? await this.storyRepository.findChapter(input.storyId, input.chapterIndex - 1)
        : null;

    const roughBeat = this.findRoughBeat(plan.roughBeats, input.chapterIndex);
    const expanded = await this.novelTextGenerator.expandChapterOutline({
      chapterIndex: input.chapterIndex,
      roughBeat,
      currentOutline: { ...planOutline },
      activeFacts: activeFacts.map((f) => ({
        factId: f.factId,
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
      })),
      characters: plan.characters.map((c) => ({ ...c })),
      forbiddenDevelopments: [...plan.forbiddenDevelopments],
      length: story.request.length,
      callContext,
    });

    plan.updateChapterOutline(input.chapterIndex, expanded.title, expanded.outline);
    chapter.alignOutline(expanded.title, expanded.outline);
    await this.storyRepository.savePlan(input.storyId, plan);

    const detailedChapters = plan.chapters
      .filter((outline) => outline.index <= input.chapterIndex)
      .map((outline) => ({ ...outline }));
    const futureRoughOutlines = plan.chapters
      .filter((outline) => outline.index > input.chapterIndex)
      .map((outline) => ({
        index: outline.index,
        title: outline.title,
        // 未来は粗いメモのみ（詳細マスクの代替）
        outline: this.roughOutlineForChapter(plan.roughBeats, outline.index, outline.outline),
      }));

    const chapterText = await this.novelTextGenerator.generateChapterText({
      metadata: {
        overview: metadataProps.overview,
        theme: metadataProps.theme,
        tone: metadataProps.tone,
        world: metadataProps.world,
        timelineRules: metadataProps.timelineRules,
        consistencyNotes: metadataProps.consistencyNotes,
      },
      plan: {
        summary: plan.summary,
        characters: plan.characters.map((c) => ({ ...c })),
        chapters: detailedChapters,
        roughBeats: plan.roughBeats.map((b) => ({ ...b, chapterIndexes: [...b.chapterIndexes] })),
        futureRoughOutlines,
      },
      chapterOutline: {
        index: input.chapterIndex,
        title: expanded.title,
        outline: expanded.outline,
      },
      length: story.request.length,
      activeFacts: activeFacts.map((f) => ({
        factId: f.factId,
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
      })),
      previousSceneSummary: previousChapter?.summaryKeyPoints,
      discoursePlan: expanded.discoursePlan,
      dialogueToNarrationRatio: expanded.dialogueToNarrationRatio,
      forbiddenDevelopments: [...plan.forbiddenDevelopments],
      revisionInstruction: chapter.revisionInstruction,
      callContext,
    });

    const s3Key = await this.chapterContentStorage.saveChapterText(
      input.storyId,
      input.chapterIndex,
      chapterText,
    );

    const extracted = await this.novelTextGenerator.extractAtomicFacts({
      chapterText,
      chapterIndex: input.chapterIndex,
      knownEntities,
      callContext,
    });

    const contradiction = await this.novelTextGenerator.detectContradictions({
      activeFacts,
      newFacts: extracted.facts.map((f) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
      })),
      callContext,
    });
    if (contradiction.hasContradiction) {
      throw new ContradictionDetectedError(
        `Contradiction detected in chapter ${input.chapterIndex} for story ${input.storyId}`,
        contradiction.contradictions,
      );
    }

    await this.persistWorldStateUpdate({
      storyId: input.storyId,
      chapterIndex: input.chapterIndex,
      extractedEntities: extracted.entities,
      extractedFacts: extracted.facts,
      knownEntities,
      activeFacts,
    });

    chapter.complete(s3Key, extracted.sceneSummary);
    await this.storyRepository.saveChapter(input.storyId, chapter);

    await this.realignFuturePlan({
      storyId: input.storyId,
      plan,
      metadataProps,
      completedChapterIndex: input.chapterIndex,
      completedTitle: expanded.title,
      completedOutline: expanded.outline,
      completedSummary: extracted.sceneSummary,
      length: story.request.length,
      activeFacts,
    });
  }

  private async persistWorldStateUpdate(args: {
    storyId: string;
    chapterIndex: number;
    extractedEntities: Array<{
      entityId: string;
      name: string;
      kind: WorldEntity['kind'];
      attributes: string;
    }>;
    extractedFacts: Array<{
      subject: string;
      predicate: string;
      object: string;
      entityIds: string[];
      validFromChapter: number;
      validToChapter?: number | null;
      supersedes?: string[];
    }>;
    knownEntities: WorldEntity[];
    activeFacts: AtomicFact[];
  }): Promise<void> {
    const entityById = new Map(args.knownEntities.map((e) => [e.entityId, e]));
    for (const entity of args.extractedEntities) {
      entityById.set(entity.entityId, {
        entityId: entity.entityId,
        name: entity.name,
        kind: entity.kind,
        attributes: entity.attributes,
        updatedAtChapter: args.chapterIndex,
      });
    }
    const entities = Array.from(entityById.values());
    await this.worldStateRepository.upsertEntities(args.storyId, entities);

    const toClose = new Set<string>();
    const newFacts: AtomicFact[] = args.extractedFacts.map((fact, ordinal) => {
      for (const id of fact.supersedes ?? []) {
        toClose.add(id);
      }
      return {
        factId: createFactId(args.chapterIndex, ordinal + 1),
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        entityIds: [...fact.entityIds],
        validFromChapter: fact.validFromChapter || args.chapterIndex,
        validToChapter:
          fact.validToChapter === null || fact.validToChapter === undefined
            ? undefined
            : fact.validToChapter,
        sourceChapterIndex: args.chapterIndex,
        supersedes: fact.supersedes ? [...fact.supersedes] : undefined,
      };
    });

    if (toClose.size > 0) {
      await this.worldStateRepository.closeFacts(
        args.storyId,
        Array.from(toClose),
        args.chapterIndex,
      );
    }
    if (newFacts.length > 0) {
      await this.worldStateRepository.appendFacts(args.storyId, newFacts);
    }

    const factsAfter = await this.worldStateRepository.listAllFacts(args.storyId);
    await this.worldStateRepository.saveSnapshot(
      args.storyId,
      WorldStateSnapshot.create({
        afterChapterIndex: args.chapterIndex,
        entities,
        facts: factsAfter,
      }),
    );
  }

  private async realignFuturePlan(args: {
    storyId: string;
    plan: Plan;
    metadataProps: StoryMetadataProps;
    completedChapterIndex: number;
    completedTitle: string;
    completedOutline: string;
    completedSummary: string;
    length: StoryLength;
    activeFacts: AtomicFact[];
  }): Promise<void> {
    const futureChapters = args.plan.chapters
      .filter((outline) => outline.index > args.completedChapterIndex)
      .map((outline) => ({ ...outline }));
    if (futureChapters.length === 0) {
      return;
    }

    const latestFacts = await this.worldStateRepository.listActiveFacts(
      args.storyId,
      args.completedChapterIndex,
    );

    const realigned = await this.novelTextGenerator.realignFuturePlan({
      metadata: {
        overview: args.metadataProps.overview,
        theme: args.metadataProps.theme,
        tone: args.metadataProps.tone,
        world: args.metadataProps.world,
        timelineRules: args.metadataProps.timelineRules,
        consistencyNotes: args.metadataProps.consistencyNotes,
      },
      planSummary: args.plan.summary,
      planTheme: args.plan.theme,
      roughBeats: args.plan.roughBeats.map((b) => ({
        ...b,
        chapterIndexes: [...b.chapterIndexes],
      })),
      characters: args.plan.characters.map((c) => ({ ...c })),
      completedChapter: {
        index: args.completedChapterIndex,
        title: args.completedTitle,
        outline: args.completedOutline,
        summaryKeyPoints: args.completedSummary,
      },
      futureChapters,
      activeFacts: latestFacts.map((f) => ({
        factId: f.factId,
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
      })),
      forbiddenDevelopments: [...args.plan.forbiddenDevelopments],
      length: args.length,
      callContext: {
        storyId: args.storyId,
        chapterIndex: args.completedChapterIndex,
      },
    });

    args.plan.reviseFutureChapters(args.completedChapterIndex, realigned.chapters);
    args.plan.replaceCharacters(realigned.characters);
    args.plan.replaceRoughBeats(realigned.roughBeats);
    await this.storyRepository.savePlan(args.storyId, args.plan);
    await this.storyRepository.savePlanSnapshot(
      args.storyId,
      PlanSnapshot.create({
        afterChapterIndex: args.completedChapterIndex,
        trigger: 'chapter_revision',
        plan: args.plan.toProps(),
      }),
    );
  }

  private findRoughBeat(beats: readonly RoughBeat[], chapterIndex: number): RoughBeat {
    const found = beats.find((beat) => beat.chapterIndexes.includes(chapterIndex));
    if (found) {
      return { ...found, chapterIndexes: [...found.chapterIndexes] };
    }
    return {
      beatId: `beat-${chapterIndex}`,
      label: `Chapter ${chapterIndex}`,
      summary: '',
      chapterIndexes: [chapterIndex],
    };
  }

  private roughOutlineForChapter(
    beats: readonly RoughBeat[],
    chapterIndex: number,
    fallback: string,
  ): string {
    const beat = beats.find((b) => b.chapterIndexes.includes(chapterIndex));
    return beat?.summary || fallback;
  }
}
