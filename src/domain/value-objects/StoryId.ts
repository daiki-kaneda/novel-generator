import { randomUUID } from 'node:crypto';
import { ValidationError } from '../errors/DomainErrors';

/**
 * 物語（ワークフロー実行単位）を一意に識別するID。
 */
export class StoryId {
  private constructor(private readonly value: string) {}

  static generate(): StoryId {
    return new StoryId(randomUUID());
  }

  static from(value: string): StoryId {
    if (!value || value.trim().length === 0) {
      throw new ValidationError('StoryId must not be empty');
    }
    return new StoryId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: StoryId): boolean {
    return this.value === other.value;
  }
}
