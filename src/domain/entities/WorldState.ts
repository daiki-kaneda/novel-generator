import { ValidationError } from '../errors/DomainErrors';

export type WorldEntityKind = 'character' | 'place' | 'item' | 'other';

export interface WorldEntity {
  entityId: string;
  name: string;
  kind: WorldEntityKind;
  attributes: string;
  updatedAtChapter: number;
}

export interface AtomicFact {
  factId: string;
  subject: string;
  predicate: string;
  object: string;
  entityIds: string[];
  /** 事実が有効になり始めた章（含む）。 */
  validFromChapter: number;
  /** 事実が無効になった章（含む）。未設定なら現在も有効。 */
  validToChapter?: number;
  sourceChapterIndex: number;
  supersedes?: string[];
}

export interface WorldStateSnapshotProps {
  afterChapterIndex: number;
  recordedAt: string;
  entities: WorldEntity[];
  facts: AtomicFact[];
}

export class WorldStateSnapshot {
  private constructor(private readonly props: WorldStateSnapshotProps) {}

  static create(
    props: Omit<WorldStateSnapshotProps, 'recordedAt'> & { recordedAt?: string },
  ): WorldStateSnapshot {
    if (props.afterChapterIndex < 0) {
      throw new ValidationError('WorldStateSnapshot afterChapterIndex must be >= 0');
    }
    return new WorldStateSnapshot({
      afterChapterIndex: props.afterChapterIndex,
      recordedAt: props.recordedAt ?? new Date().toISOString(),
      entities: props.entities.map((e) => ({ ...e })),
      facts: props.facts.map((f) => ({
        ...f,
        entityIds: [...f.entityIds],
        supersedes: f.supersedes ? [...f.supersedes] : undefined,
      })),
    });
  }

  static restore(props: WorldStateSnapshotProps): WorldStateSnapshot {
    return WorldStateSnapshot.create(props);
  }

  get afterChapterIndex(): number {
    return this.props.afterChapterIndex;
  }

  get recordedAt(): string {
    return this.props.recordedAt;
  }

  get entities(): WorldEntity[] {
    return this.props.entities.map((e) => ({ ...e }));
  }

  get facts(): AtomicFact[] {
    return this.props.facts.map((f) => ({
      ...f,
      entityIds: [...f.entityIds],
      supersedes: f.supersedes ? [...f.supersedes] : undefined,
    }));
  }

  toProps(): WorldStateSnapshotProps {
    return {
      afterChapterIndex: this.props.afterChapterIndex,
      recordedAt: this.props.recordedAt,
      entities: this.entities,
      facts: this.facts,
    };
  }
}

export function isFactActiveAt(fact: AtomicFact, chapterIndex: number): boolean {
  if (fact.validFromChapter > chapterIndex) {
    return false;
  }
  if (fact.validToChapter !== undefined && fact.validToChapter < chapterIndex) {
    return false;
  }
  return true;
}

export function createFactId(chapterIndex: number, ordinal: number): string {
  return `fact-c${String(chapterIndex).padStart(4, '0')}-${String(ordinal).padStart(3, '0')}`;
}
