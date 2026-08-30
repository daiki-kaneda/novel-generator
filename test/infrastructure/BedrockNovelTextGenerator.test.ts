import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockConverseLogEvent,
  BedrockNovelTextGenerator,
} from '../../src/infrastructure/bedrock/BedrockNovelTextGenerator';
import { RecordUsageInput, UsageRecorder } from '../../src/application/ports/UsageAccountRepository';

describe('BedrockNovelTextGenerator structured logging', () => {
  const modelId = 'test-model-id';

  function createGenerator(
    sendImpl: BedrockRuntimeClient['send'],
    usageRecorder?: UsageRecorder,
  ): BedrockNovelTextGenerator {
    const client = {
      send: sendImpl,
    } as unknown as BedrockRuntimeClient;
    return new BedrockNovelTextGenerator(client, modelId, usageRecorder);
  }

  function lastConverseInput(sendMock: jest.Mock): Record<string, unknown> {
    const command = sendMock.mock.calls[0][0] as { input: Record<string, unknown> };
    return command.input;
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
    const send = jest.fn().mockResolvedValue({
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
    });
    const generator = createGenerator(send);

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
      structuredOutput: true,
    });
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(events[0]).not.toHaveProperty('chapterIndex');

    const input = lastConverseInput(send);
    expect(input.outputConfig).toMatchObject({
      textFormat: {
        type: 'json_schema',
      },
    });
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

  it('includes chapterIndex for chapter generation logging without structured output', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const send = jest.fn().mockResolvedValue({
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
    });
    const generator = createGenerator(send);

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
      structuredOutput: false,
    });
    expect(lastConverseInput(send).outputConfig).toBeUndefined();
  });

  it('records usage via the injected recorder when callContext has a userEmail', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const send = jest.fn().mockResolvedValue({
      output: {
        message: {
          content: [{ text: '{"overview":"o","theme":"t","tone":"tone","characters":[{"name":"H","role":"主人公","personality":"p","background":"b","goals":"g","relationships":"r"}],"world":{"geography":"g","timePeriod":"t"},"timelineRules":"tr","consistencyNotes":"cn"}' }],
        },
      },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      stopReason: 'end_turn',
    });
    const recorded: Array<{ userEmail: string; input: RecordUsageInput }> = [];
    const usageRecorder: UsageRecorder = {
      recordUsage: async (userEmail, input) => {
        recorded.push({ userEmail, input });
      },
    };
    const generator = createGenerator(send, usageRecorder);

    await generator.generateMetadata({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      length: 'short',
      callContext: { storyId: 'story-1', userEmail: 'user@example.com' },
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].userEmail).toBe('user@example.com');
    expect(recorded[0].input).toMatchObject({
      storyId: 'story-1',
      phase: 'generate_metadata',
      modelId,
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it('skips usage recording when callContext has no userEmail', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const send = jest.fn().mockResolvedValue({
      output: {
        message: {
          content: [{ text: '{"overview":"o","theme":"t","tone":"tone","characters":[{"name":"H","role":"主人公","personality":"p","background":"b","goals":"g","relationships":"r"}],"world":{"geography":"g","timePeriod":"t"},"timelineRules":"tr","consistencyNotes":"cn"}' }],
        },
      },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      stopReason: 'end_turn',
    });
    const recordUsage = jest.fn();
    const generator = createGenerator(send, { recordUsage });

    await generator.generateMetadata({
      overview: 'overview',
      theme: 'theme',
      characters: 'characters',
      length: 'short',
      callContext: { storyId: 'story-1' },
    });

    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('does not let a usage recording failure fail the generation call', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const send = jest.fn().mockResolvedValue({
      output: {
        message: {
          content: [{ text: '{"overview":"o","theme":"t","tone":"tone","characters":[{"name":"H","role":"主人公","personality":"p","background":"b","goals":"g","relationships":"r"}],"world":{"geography":"g","timePeriod":"t"},"timelineRules":"tr","consistencyNotes":"cn"}' }],
        },
      },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      stopReason: 'end_turn',
    });
    const usageRecorder: UsageRecorder = {
      recordUsage: async () => {
        throw new Error('table unavailable');
      },
    };
    const generator = createGenerator(send, usageRecorder);

    await expect(
      generator.generateMetadata({
        overview: 'overview',
        theme: 'theme',
        characters: 'characters',
        length: 'short',
        callContext: { storyId: 'story-1', userEmail: 'user@example.com' },
      }),
    ).resolves.toBeDefined();
  });

  it('throws when summarizeChapter JSON cannot be parsed', async () => {
    const generator = createGenerator(
      jest.fn().mockResolvedValue({
        output: {
          message: {
            content: [{ text: 'not-json' }],
          },
        },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        stopReason: 'end_turn',
      }),
    );

    await expect(generator.summarizeChapter('chapter', 'short')).rejects.toThrow(
      /Failed to parse Bedrock JSON response/,
    );
  });
});
