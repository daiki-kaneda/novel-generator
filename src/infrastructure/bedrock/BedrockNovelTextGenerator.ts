import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  NovelTextGenerator,
  GenerateMetadataInput,
  GeneratedMetadata,
  GeneratePlanInput,
  GeneratedPlan,
  GenerateChapterTextInput,
} from '../../application/ports/NovelTextGenerator';
import { STORY_LENGTH_PRESETS, StoryLength } from '../../domain/value-objects/StoryLength';

/** 設定書は人物追加の再生成などで長くなりやすいため、余裕を持たせる。 */
const METADATA_MAX_TOKENS = 8192;
/** プランは章アウトライン配列のため、再生成時に長くなりやすい。 */
const PLAN_MAX_TOKENS = 8192;

/**
 * Bedrock (Claude Sonnet) を使ったテキスト生成アダプタ。
 * メタデータ生成・プラン生成・章生成・要約生成のすべてで、Bedrockの
 * Converse APIを共通のクライアントで呼び出す。
 */
export class BedrockNovelTextGenerator implements NovelTextGenerator {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
  ) {}

  async generateMetadata(input: GenerateMetadataInput): Promise<GeneratedMetadata> {
    const systemPrompt = [
      'あなたは短編・中編小説の編集者兼設定担当です。',
      'ユーザーが与えた概要・テーマ・登場人物などのシード情報を元に、執筆の正本となる物語設定書を作成してください。',
      '登場人物は性格・背景・目的・関係性まで具体化し、地理・時代・時間経過ルール・一貫性制約を明確にしてください。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      JSON.stringify({
        overview: 'string',
        theme: 'string',
        tone: 'string',
        characters: [
          {
            name: 'string',
            role: 'string',
            personality: 'string',
            background: 'string',
            goals: 'string',
            relationships: 'string',
            speechStyle: 'string (optional)',
          },
        ],
        world: {
          geography: 'string',
          timePeriod: 'string',
          socialContext: 'string (optional)',
        },
        timelineRules: 'string',
        consistencyNotes: 'string',
      }),
      'characters は1人以上の配列にしてください。シードにない情報は物語として自然な範囲で補完して構いません。',
      '各文字列フィールドは簡潔に（目安: 1〜3文）。長文の小説本文や重複説明は書かないでください。',
    ].join('\n');

    const sections = [
      `概要シード: ${input.overview}`,
      `テーマシード: ${input.theme}`,
      `登場人物シード: ${input.characters}`,
      `長さプリセット: ${input.length}`,
    ];
    if (input.tone) {
      sections.push(`文調シード: ${input.tone}`);
    }
    if (input.setting) {
      sections.push(`地理・時代などの設定シード: ${input.setting}`);
    }
    if (input.previousMetadata && input.feedback) {
      sections.push(
        '--- 前回提示した設定書 ---',
        JSON.stringify({
          overview: input.previousMetadata.overview,
          theme: input.previousMetadata.theme,
          tone: input.previousMetadata.tone,
          characters: input.previousMetadata.characters,
          world: input.previousMetadata.world,
          timelineRules: input.previousMetadata.timelineRules,
          consistencyNotes: input.previousMetadata.consistencyNotes,
        }),
        '--- ユーザーからの修正フィードバック ---',
        input.feedback,
        '上記フィードバックを反映して、設定書全体を改めて作成してください。',
        'フィードバックで追加が求められた要素は必ず含めつつ、各フィールドは簡潔に保ってください。',
      );
    }

    const responseText = await this.converse(systemPrompt, sections.join('\n\n'), METADATA_MAX_TOKENS);
    return this.parseJson<GeneratedMetadata>(responseText);
  }

  async generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは短編・中編小説の編集者兼プロットライターです。',
      '与えられた物語設定書（登場人物・世界観・時間軸・一貫性制約）に厳密に従い、小説の生成プランを作成してください。',
      '地理・時間経過・人物の性格/背景/関係性を矛盾させないこと。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      '{"summary": string, "theme": string, "characters": string, "chapters": [{"index": number, "title": string, "outline": string}]}',
      `章は${preset.chapterCountHint}を目安に、物語として一貫した構成にしてください。indexは1から始まる連番にしてください。`,
      `各章の本文はおよそ${preset.targetCharsPerChapter}を想定して、章立ての粒度を決めてください。`,
      'characters フィールドは設定書の登場人物を読みやすい日本語の要約文として書いてください。',
      'summary / theme / characters は簡潔に。各章の outline は2〜4文程度に留め、本文そのものは書かないでください。',
    ].join('\n');

    const sections = [
      '--- 物語設定書 ---',
      JSON.stringify(input.metadata),
      `長さプリセット: ${input.length}`,
    ];
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
        '上記フィードバックを反映して、プラン全体を改めて作成してください。設定書との矛盾は作らないでください。',
        'フィードバックを反映しつつ、各章 outline は簡潔に保ってください。',
      );
    }

    const responseText = await this.converse(systemPrompt, sections.join('\n\n'), PLAN_MAX_TOKENS);
    return this.parseJson<GeneratedPlan>(responseText);
  }

  async generateChapterText(input: GenerateChapterTextInput): Promise<string> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは小説家です。指定された章の本文のみを日本語で執筆してください。',
      '本文以外の説明・見出し・メタ情報は出力しないでください。',
      `この章の本文はおよそ${preset.targetCharsPerChapter}を目安に書いてください。`,
      '物語設定書の人物・地理・時間ルール・一貫性制約を破ってはなりません。',
      'プラン全体の章立てにおける当該章の位置づけを守り、前後の章との時間・場所の連続性を維持してください。',
    ].join('\n');

    const sections = [
      '--- 物語設定書（破ってはならない前提） ---',
      JSON.stringify(input.metadata),
      '--- 物語プラン全体 ---',
      JSON.stringify(input.plan),
      `この章の番号: ${input.chapterOutline.index}`,
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
      'timeAndPlace には時刻・経過時間・季節・場所の相対関係を含めてください。',
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
