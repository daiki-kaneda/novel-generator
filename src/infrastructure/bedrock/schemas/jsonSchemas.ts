/**
 * Bedrock Converse Structured Outputs 用の closed JSON Schema。
 * 全 object に additionalProperties: false を付与する。
 */

const CHARACTER_PROFILE_PROPERTIES = {
  name: { type: 'string' },
  role: { type: 'string' },
  personality: { type: 'string' },
  background: { type: 'string' },
  goals: { type: 'string' },
  relationships: { type: 'string' },
  speechStyle: { type: 'string' },
  appearance: { type: 'string' },
} as const;

const CHARACTER_PROFILE_REQUIRED = [
  'name',
  'role',
  'personality',
  'background',
  'goals',
  'relationships',
] as const;

const CHARACTER_PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: CHARACTER_PROFILE_PROPERTIES,
  required: [...CHARACTER_PROFILE_REQUIRED],
} as const;

const CHAPTER_OUTLINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    index: { type: 'integer' },
    title: { type: 'string' },
    outline: { type: 'string' },
  },
  required: ['index', 'title', 'outline'],
} as const;

const WORLD_SETTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    geography: { type: 'string' },
    timePeriod: { type: 'string' },
    socialContext: { type: 'string' },
  },
  required: ['geography', 'timePeriod'],
} as const;

export const GENERATED_METADATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overview: { type: 'string' },
    theme: { type: 'string' },
    tone: { type: 'string' },
    characters: {
      type: 'array',
      minItems: 1,
      items: CHARACTER_PROFILE_SCHEMA,
    },
    world: WORLD_SETTING_SCHEMA,
    timelineRules: { type: 'string' },
    consistencyNotes: { type: 'string' },
  },
  required: [
    'overview',
    'theme',
    'tone',
    'characters',
    'world',
    'timelineRules',
    'consistencyNotes',
  ],
} as const;

const ROUGH_BEAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    beatId: { type: 'string' },
    label: { type: 'string' },
    summary: { type: 'string' },
    chapterIndexes: {
      type: 'array',
      items: { type: 'integer' },
    },
  },
  required: ['beatId', 'label', 'summary', 'chapterIndexes'],
} as const;

export const GENERATED_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    theme: { type: 'string' },
    characters: {
      type: 'array',
      minItems: 1,
      items: CHARACTER_PROFILE_SCHEMA,
    },
    chapters: {
      type: 'array',
      minItems: 1,
      items: CHAPTER_OUTLINE_SCHEMA,
    },
    roughBeats: {
      type: 'array',
      items: ROUGH_BEAT_SCHEMA,
    },
  },
  required: ['summary', 'theme', 'characters', 'chapters', 'roughBeats'],
} as const;

export const REVISED_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    chapters: {
      type: 'array',
      minItems: 1,
      items: CHAPTER_OUTLINE_SCHEMA,
    },
    characters: {
      type: 'array',
      minItems: 1,
      items: CHARACTER_PROFILE_SCHEMA,
    },
  },
  required: ['chapters', 'characters'],
} as const;

export const CHAPTER_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    characterStates: { type: 'string' },
    unresolvedForeshadowing: { type: 'string' },
    timeAndPlace: { type: 'string' },
    keyEvents: { type: 'string' },
  },
  required: ['characterStates', 'unresolvedForeshadowing', 'timeAndPlace', 'keyEvents'],
} as const;

export const ATOMIC_FACTS_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subject: { type: 'string' },
          predicate: { type: 'string' },
          object: { type: 'string' },
          entityIds: {
            type: 'array',
            items: { type: 'string' },
          },
          validFromChapter: { type: 'integer' },
          validToChapter: { type: ['integer', 'null'] },
          supersedes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['subject', 'predicate', 'object', 'entityIds', 'validFromChapter'],
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entityId: { type: 'string' },
          name: { type: 'string' },
          kind: { type: 'string', enum: ['character', 'place', 'item', 'other'] },
          attributes: { type: 'string' },
        },
        required: ['entityId', 'name', 'kind', 'attributes'],
      },
    },
    sceneSummary: { type: 'string' },
  },
  required: ['facts', 'entities', 'sceneSummary'],
} as const;

export const CONTRADICTION_CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hasContradiction: { type: 'boolean' },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          newFact: { type: 'string' },
          conflictingFact: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['newFact', 'conflictingFact', 'reason'],
      },
    },
  },
  required: ['hasContradiction', 'contradictions'],
} as const;

export const EXPANDED_CHAPTER_OUTLINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    outline: { type: 'string' },
    discoursePlan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          role: {
            type: 'string',
            enum: ['theme', 'elaboration', 'contrast', 'result', 'dialogue', 'description'],
          },
          purpose: { type: 'string' },
        },
        required: ['role', 'purpose'],
      },
    },
    dialogueToNarrationRatio: { type: 'string' },
  },
  required: ['title', 'outline', 'discoursePlan', 'dialogueToNarrationRatio'],
} as const;

export const REALIGNED_FUTURE_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    roughBeats: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          beatId: { type: 'string' },
          label: { type: 'string' },
          summary: { type: 'string' },
          chapterIndexes: {
            type: 'array',
            items: { type: 'integer' },
          },
        },
        required: ['beatId', 'label', 'summary', 'chapterIndexes'],
      },
    },
    chapters: {
      type: 'array',
      items: CHAPTER_OUTLINE_SCHEMA,
    },
    characters: {
      type: 'array',
      minItems: 1,
      items: CHARACTER_PROFILE_SCHEMA,
    },
  },
  required: ['roughBeats', 'chapters', 'characters'],
} as const;

export type JsonSchemaObject = Record<string, unknown>;

export function schemaToJsonString(schema: JsonSchemaObject): string {
  return JSON.stringify(schema);
}
