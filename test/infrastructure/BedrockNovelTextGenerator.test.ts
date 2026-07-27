import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockConverseLogEvent,
  BedrockNovelTextGenerator,
} from '../../src/infrastructure/bedrock/BedrockNovelTextGenerator';

describe('BedrockNovelTextGenerator structured logging', () => {
  const modelId = 'test-model-id';

  function createGenerator(sendImpl: BedrockRuntimeClient['send']): BedrockNovelTextGenerator {
    const client = {
      send: sendImpl,
    } as unknown as BedrockRuntimeClient;
    return new BedrockNovelTextGenerator(client, modelId);
  }

  function parseLoggedEvents(logSpy: jest.SpyInstance): BedrockConverseLogEvent[] {
    return logSpy.mock.calls
      .map((call) => {
        const raw = call[0];
        if (typeof raw !== 'string') {
          return null;
        }
        try {
          return JSON.parse(raw) as BedrockConverseLogEvent;
        } catch {
          return null;
        }
      })
      .filter((event): event is BedrockConverseLogEvent => event?.event === 'bedrock_converse');
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a successful bedrock_converse event with tokens and context', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const generator = createGenerator(
      jest.fn().mockResolvedValue({
        output: {
          message: {
            content: [{ text: '{"overview":"o","theme":"t","tone":"tone","characters":[{"name":"H","role":"主人公","personality":"p","background":"b","goals":"g","relationships":"r"}],"world":{"geography":"g","timePeriod":"t"},"timelineRules":"tr","consistencyNotes":"cn"}' }],
          },
        },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        },
        stopReason: 'end_turn',
      }),
    );

    await generator.generateMetadata({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      length: 'short',
      callContext: { storyId: 'story-1' },
    });

    const events = parseLoggedEvents(logSpy);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'bedrock_converse',
      phase: 'generate_metadata',
      modelId,
      storyId: 'story-1',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      maxTokens: 8192,
      stopReason: 'end_turn',
      success: true,
      errorName: null,
      errorMessage: null,
    });
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(events[0]).not.toHaveProperty('chapterIndex');
  });

  it('logs success=false and rethrows when Bedrock fails', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const generator = createGenerator(
      jest.fn().mockRejectedValue(Object.assign(new Error('throttled'), { name: 'ThrottlingException' })),
    );

    await expect(
      generator.generatePlan({
        metadata: {
          overview: 'o',
          theme: 't',
          tone: 'tone',
          characters: [
            {
              name: 'H',
              role: '主人公',
              personality: 'p',
              background: 'b',
              goals: 'g',
              relationships: 'r',
            },
          ],
          world: { geography: 'g', timePeriod: 't' },
          timelineRules: 'tr',
          consistencyNotes: 'cn',
        },
        length: 'short',
        callContext: { storyId: 'story-err' },
      }),
    ).rejects.toThrow('throttled');

    const events = parseLoggedEvents(logSpy);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'bedrock_converse',
      phase: 'generate_plan',
      storyId: 'story-err',
      success: false,
      errorName: 'ThrottlingException',
      errorMessage: 'throttled',
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      stopReason: null,
    });
  });

  it('includes chapterIndex for chapter generation logging', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const generator = createGenerator(
      jest.fn().mockResolvedValue({
        output: {
          message: {
            content: [{ text: 'generated chapter body' }],
          },
        },
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
        stopReason: 'end_turn',
      }),
    );

    await generator.generateChapterText({
      metadata: {
        overview: 'o',
        theme: 't',
        tone: 'tone',
        world: { geography: 'g', timePeriod: 't' },
        timelineRules: 'tr',
        consistencyNotes: 'cn',
      },
      plan: {
        summary: 's',
        characters: [
          {
            name: 'H',
            role: '主人公',
            personality: 'p',
            background: 'b',
            goals: 'g',
            relationships: 'r',
          },
        ],
        chapters: [{ index: 1, title: 'Chapter 1', outline: 'outline' }],
      },
      chapterOutline: { index: 1, title: 'Chapter 1', outline: 'outline' },
      length: 'short',
      callContext: { storyId: 'story-ch', chapterIndex: 1 },
    });

    const events = parseLoggedEvents(logSpy);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      phase: 'generate_chapter',
      storyId: 'story-ch',
      chapterIndex: 1,
      success: true,
    });
  });
});
