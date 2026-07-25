import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  NovelTextGenerator,
  GeneratePlanInput,
  GeneratedPlan,
  GenerateChapterTextInput,
} from '../../application/ports/NovelTextGenerator';
import { STORY_LENGTH_PRESETS, StoryLength } from '../../domain/value-objects/StoryLength';

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Bedrock (Claude Sonnet) を使ったテキスト生成アダプタ。
 * プラン生成・章生成・要約生成のすべてで、Bedrockの
 * Converse APIを共通のクライアントで呼び出す。
 */
export class BedrockNovelTextGenerator implements NovelTextGenerator {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
  ) {}

  async generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは短編・中編小説の編集者兼プロットライターです。',
      '与えられた概要・テーマ・登場人物・文調から、小説の生成プランを作成してください。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      '{"summary": string, "theme": string, "characters": string, "chapters": [{"index": number, "title": string, "outline": string}]}',
      `章は${preset.chapterCountHint}を目安に、物語として一貫した構成にしてください。indexは1から始まる連番にしてください。`,
      `各章の本文はおよそ${preset.targetCharsPerChapter}を想定して、章立ての粒度を決めてください。`,
    ].join('\n');

    const sections = [
      `概要: ${input.overview}`,
      `テーマ: ${input.theme}`,
      `登場人物: ${input.characters}`,
      `長さプリセット: ${input.length}`,
    ];
    if (input.tone) {
      sections.push(`文調: ${input.tone}`);
    }
    if (input.previousPlan && input.feedback) {
      sections.push(
        '--- 前回提示したプラン ---',
        JSON.stringify({
          summary: input.previousPlan.summary,
          theme: input.previousPlan.theme,
          characters: input.previousPlan.characters,
          chapters: input.previousPlan.chapters,
        }),
        '--- ユーザーからの修正フィードバック ---',
        input.feedback,
        '上記フィードバックを反映して、プラン全体を改めて作成してください。',
      );
    }

    const responseText = await this.converse(systemPrompt, sections.join('\n\n'), DEFAULT_MAX_TOKENS);
    return this.parseJson<GeneratedPlan>(responseText);
  }

  async generateChapterText(input: GenerateChapterTextInput): Promise<string> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは小説家です。指定された章の本文のみを日本語で執筆してください。',
      '本文以外の説明・見出し・メタ情報は出力しないでください。',
      `この章の本文はおよそ${preset.targetCharsPerChapter}を目安に書いてください。`,
    ].join('\n');

    const sections = [
      `物語全体の概要: ${input.planSummary}`,
      `テーマ: ${input.theme}`,
      `登場人物: ${input.characters}`,
      `この章のタイトル: ${input.chapterOutline.title}`,
      `この章で描くべき内容: ${input.chapterOutline.outline}`,
    ];
    if (input.previousChapterSummary) {
      sections.push(`直前までの章の重要ポイント: ${input.previousChapterSummary}`);
    }
    if (input.revisionInstruction) {
      sections.push(`改訂指示（この内容を必ず反映して書き直してください）: ${input.revisionInstruction}`);
    }

    return await this.converse(systemPrompt, sections.join('\n\n'), preset.chapterMaxTokens);
  }

  async summarizeChapter(chapterText: string, length: StoryLength): Promise<string> {
    const preset = STORY_LENGTH_PRESETS[length];
    const systemPrompt = [
      '次の章本文から、次の章を書く上で必要な重要ポイントを抽出してください。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      '{"characterStates": string, "unresolvedForeshadowing": string, "timeAndPlace": string, "keyEvents": string}',
      '各項目は簡潔な日本語で書いてください。本文そのものを繰り返さないでください。',
    ].join('\n');

    const responseText = await this.converse(systemPrompt, chapterText, preset.summaryMaxTokens);
    // 次章プロンプトへ渡しやすいよう、構造化結果を読みやすい文章に整形する。
    try {
      const parsed = this.parseJson<{
        characterStates?: string;
        unresolvedForeshadowing?: string;
        timeAndPlace?: string;
        keyEvents?: string;
      }>(responseText);
      return [
        `登場人物の状態: ${parsed.characterStates ?? ''}`,
        `未解決の伏線: ${parsed.unresolvedForeshadowing ?? ''}`,
        `時間・場所: ${parsed.timeAndPlace ?? ''}`,
        `重要イベント: ${parsed.keyEvents ?? ''}`,
      ].join('\n');
    } catch {
      return responseText;
    }
  }

  private async converse(
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
  ): Promise<string> {
    const result = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: [{ text: userContent }] }],
        inferenceConfig: { maxTokens, temperature: 0.7 },
      }),
    );

    const text = result.output?.message?.content?.find((block) => block.text)?.text;
    if (!text) {
      throw new Error('Bedrock returned an empty response');
    }
    return text;
  }

  private parseJson<T>(text: string): T {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch (error) {
      throw new Error(`Failed to parse Bedrock JSON response: ${(error as Error).message}`);
    }
  }
}
