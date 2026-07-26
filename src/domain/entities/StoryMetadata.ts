import { ValidationError } from '../errors/DomainErrors';

/** 登場人物1人分の詳細プロフィール。 */
export interface CharacterProfile {
  name: string;
  role: string;
  personality: string;
  background: string;
  goals: string;
  relationships: string;
  speechStyle?: string;
  /** 年齢感・体格・髪型・服装などの外見上の特徴（簡潔に）。 */
  appearance?: string;
}

/** 地理・時代・社会的背景。 */
export interface WorldSetting {
  geography: string;
  timePeriod: string;
  socialContext?: string;
}

export interface StoryMetadataProps {
  overview: string;
  theme: string;
  tone: string;
  characters: CharacterProfile[];
  world: WorldSetting;
  /** 時間経過のルール（1日の長さ、章間の想定経過など）。 */
  timelineRules: string;
  /** 絶対に破ってはいけない制約。 */
  consistencyNotes: string;
  /** これまでにユーザーから寄せられたメタデータ修正フィードバックの履歴。 */
  revisionHistory: string[];
}

/**
 * 承認対象となる物語設定書（登場人物・世界観・時間軸・一貫性制約）。
 * ユーザーの初期リクエスト（StoryRequest）はシードとして別途保持し、
 * Plan/章生成はこのエンティティを正本として読む。
 */
export class StoryMetadata {
  private constructor(private props: StoryMetadataProps) {}

  static create(props: Omit<StoryMetadataProps, 'revisionHistory'>): StoryMetadata {
    StoryMetadata.validate(props);
    return new StoryMetadata({ ...props, revisionHistory: [] });
  }

  static restore(props: StoryMetadataProps): StoryMetadata {
    return new StoryMetadata({
      ...props,
      characters: [...(props.characters ?? [])],
      world: { ...(props.world ?? { geography: '', timePeriod: '' }) },
      revisionHistory: [...(props.revisionHistory ?? [])],
    });
  }

  private static validate(props: Omit<StoryMetadataProps, 'revisionHistory'>): void {
    if (!props.overview?.trim()) {
      throw new ValidationError('Metadata overview is required');
    }
    if (!props.theme?.trim()) {
      throw new ValidationError('Metadata theme is required');
    }
    if (!props.characters || props.characters.length === 0) {
      throw new ValidationError('Metadata must contain at least one character');
    }
    if (!props.world?.geography?.trim()) {
      throw new ValidationError('Metadata world.geography is required');
    }
    if (!props.world?.timePeriod?.trim()) {
      throw new ValidationError('Metadata world.timePeriod is required');
    }
  }

  get overview(): string {
    return this.props.overview;
  }

  get theme(): string {
    return this.props.theme;
  }

  get tone(): string {
    return this.props.tone;
  }

  get characters(): readonly CharacterProfile[] {
    return this.props.characters;
  }

  get world(): WorldSetting {
    return this.props.world;
  }

  get timelineRules(): string {
    return this.props.timelineRules;
  }

  get consistencyNotes(): string {
    return this.props.consistencyNotes;
  }

  get revisionHistory(): readonly string[] {
    return this.props.revisionHistory;
  }

  /** 登場人物プロフィールを読みやすい日本語の要約文へ平坦化する。 */
  charactersAsText(): string {
    return this.props.characters
      .map((c) => {
        const parts = [
          `${c.name}（${c.role}）`,
          `性格: ${c.personality}`,
          `背景: ${c.background}`,
          `目的: ${c.goals}`,
          `関係: ${c.relationships}`,
        ];
        if (c.appearance) {
          parts.push(`外見: ${c.appearance}`);
        }
        if (c.speechStyle) {
          parts.push(`話し方: ${c.speechStyle}`);
        }
        return parts.join(' / ');
      })
      .join('\n');
  }

  /** メタデータ拒否時のフィードバックを履歴に記録する。 */
  recordRejection(feedback: string): void {
    this.props.revisionHistory.push(feedback);
  }

  toProps(): StoryMetadataProps {
    return {
      ...this.props,
      characters: this.props.characters.map((c) => ({ ...c })),
      world: { ...this.props.world },
      revisionHistory: [...this.props.revisionHistory],
    };
  }
}
