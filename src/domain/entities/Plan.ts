import { ChapterOutline } from './Chapter';
import { CharacterProfile } from './StoryMetadata';
import { ValidationError } from '../errors/DomainErrors';

export interface PlanProps {
  summary: string;
  theme: string;
  /**
   * 執筆時の登場人物の正本（構造化）。章生成・改訂で動的に更新される。
   * StoryMetadata.characters は初期スナップショット（アンカー）として別途保持する。
   */
  characters: CharacterProfile[];
  chapters: ChapterOutline[];
  /** これまでにユーザーから寄せられたプラン修正フィードバックの履歴（再生成の根拠として保持）。 */
  revisionHistory: string[];
}

/** Plan 変遷記録のきっかけ。 */
export type PlanSnapshotTrigger = 'initial' | 'chapter_revision';

/**
 * 動的改訂前後の Plan 状態を残すデバッグ用スナップショット。
 * afterChapterIndex=0 は初期 Plan、1以上は当該章完了後の改訂結果。
 */
export interface PlanSnapshotProps {
  afterChapterIndex: number;
  trigger: PlanSnapshotTrigger;
  recordedAt: string;
  plan: PlanProps;
}

export class PlanSnapshot {
  private constructor(private readonly props: PlanSnapshotProps) {}

  static create(props: Omit<PlanSnapshotProps, 'recordedAt'> & { recordedAt?: string }): PlanSnapshot {
    if (props.afterChapterIndex < 0) {
      throw new ValidationError('PlanSnapshot afterChapterIndex must be >= 0');
    }
    return new PlanSnapshot({
      afterChapterIndex: props.afterChapterIndex,
      trigger: props.trigger,
      recordedAt: props.recordedAt ?? new Date().toISOString(),
      plan: {
        ...props.plan,
        characters: props.plan.characters.map((c) => ({ ...c })),
        chapters: [...props.plan.chapters],
        revisionHistory: [...(props.plan.revisionHistory ?? [])],
      },
    });
  }

  static restore(props: PlanSnapshotProps): PlanSnapshot {
    return PlanSnapshot.create(props);
  }

  get afterChapterIndex(): number {
    return this.props.afterChapterIndex;
  }

  get trigger(): PlanSnapshotTrigger {
    return this.props.trigger;
  }

  get recordedAt(): string {
    return this.props.recordedAt;
  }

  get plan(): PlanProps {
    return {
      ...this.props.plan,
      characters: this.props.plan.characters.map((c) => ({ ...c })),
      chapters: [...this.props.plan.chapters],
      revisionHistory: [...this.props.plan.revisionHistory],
    };
  }

  toProps(): PlanSnapshotProps {
    return {
      afterChapterIndex: this.props.afterChapterIndex,
      trigger: this.props.trigger,
      recordedAt: this.props.recordedAt,
      plan: this.plan,
    };
  }
}

/**
 * 承認対象となる物語のプラン（概要・テーマ・登場人物・章構成）。
 * 章生成中は未来章のアウトラインと characters が動的に改訂される。
 */
export class Plan {
  private constructor(private props: PlanProps) {}

  static create(props: Omit<PlanProps, 'revisionHistory'>): Plan {
    if (props.chapters.length === 0) {
      throw new ValidationError('Plan must contain at least one chapter');
    }
    const characters = Plan.copyCharacters(props.characters);
    if (characters.length === 0) {
      throw new ValidationError('Plan must contain at least one character');
    }
    Plan.validateCharacters(characters);
    return new Plan({ ...props, characters, revisionHistory: [] });
  }

  static restore(props: PlanProps): Plan {
    return new Plan({
      ...props,
      characters: Plan.normalizeCharacters(props.characters as unknown),
      chapters: [...(props.chapters ?? [])],
      revisionHistory: [...(props.revisionHistory ?? [])],
    });
  }

  get summary(): string {
    return this.props.summary;
  }

  get theme(): string {
    return this.props.theme;
  }

  get characters(): readonly CharacterProfile[] {
    return this.props.characters;
  }

  get chapters(): readonly ChapterOutline[] {
    return this.props.chapters;
  }

  get revisionHistory(): readonly string[] {
    return this.props.revisionHistory;
  }

  /** プラン拒否時のフィードバックを履歴に記録する（次回生成のプロンプトに使う）。 */
  recordRejection(feedback: string): void {
    this.props.revisionHistory.push(feedback);
  }

  /**
   * 完了した章より後の章（index > completedChapterIndex）の title/outline だけを差し替える。
   * 返却された revised の index 集合が期待される未来章と完全一致しない場合は ValidationError。
   * summary / theme / 完了済み章は変更しない。
   */
  reviseFutureChapters(completedChapterIndex: number, revised: ChapterOutline[]): void {
    const expected = this.props.chapters.filter((c) => c.index > completedChapterIndex);
    if (expected.length === 0) {
      if (revised.length > 0) {
        throw new ValidationError('No future chapters to revise, but revised outlines were provided');
      }
      return;
    }

    const expectedIndexes = expected.map((c) => c.index).sort((a, b) => a - b);
    const revisedIndexes = revised.map((c) => c.index).sort((a, b) => a - b);
    if (
      expectedIndexes.length !== revisedIndexes.length ||
      expectedIndexes.some((index, i) => index !== revisedIndexes[i])
    ) {
      throw new ValidationError(
        `Revised chapter indexes must exactly match future chapters. expected=[${expectedIndexes.join(',')}] got=[${revisedIndexes.join(',')}]`,
      );
    }

    const byIndex = new Map(revised.map((c) => [c.index, c]));
    this.props.chapters = this.props.chapters.map((chapter) => {
      if (chapter.index <= completedChapterIndex) {
        return chapter;
      }
      const next = byIndex.get(chapter.index)!;
      return { index: chapter.index, title: next.title, outline: next.outline };
    });
  }

  /**
   * 章完了後の登場人物プロフィールを置き換える。
   * 新規人物の追加・心境/関係性の更新を許容する。空配列は不可。
   */
  replaceCharacters(characters: CharacterProfile[]): void {
    const next = Plan.copyCharacters(characters);
    if (next.length === 0) {
      throw new ValidationError('Revised plan characters must contain at least one character');
    }
    Plan.validateCharacters(next);
    this.props.characters = next;
  }

  toProps(): PlanProps {
    return {
      ...this.props,
      characters: Plan.copyCharacters(this.props.characters),
      chapters: [...this.props.chapters],
      revisionHistory: [...this.props.revisionHistory],
    };
  }

  private static copyCharacters(characters: readonly CharacterProfile[]): CharacterProfile[] {
    return characters.map((c) => ({ ...c }));
  }

  private static validateCharacters(characters: CharacterProfile[]): void {
    for (const [i, character] of characters.entries()) {
      if (!character.name?.trim()) {
        throw new ValidationError(`Plan character at index ${i} must have a name`);
      }
      if (!character.role?.trim()) {
        throw new ValidationError(`Plan character "${character.name}" must have a role`);
      }
    }
  }

  /** 旧形式（string）や欠損を含む永続化データを構造化配列へ正規化する。 */
  private static normalizeCharacters(characters: unknown): CharacterProfile[] {
    if (Array.isArray(characters)) {
      return Plan.copyCharacters(characters as CharacterProfile[]);
    }
    if (typeof characters === 'string' && characters.trim()) {
      return [
        {
          name: '（既存プラン）',
          role: '要約',
          personality: '',
          background: '',
          goals: '',
          relationships: characters,
        },
      ];
    }
    return [];
  }
}
