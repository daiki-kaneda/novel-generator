import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  NovelTextGenerator,
  GenerateMetadataInput,
  GeneratedMetadata,
  GeneratePlanInput,
  GeneratedPlan,
  GenerateChapterTextInput,
  RevisePlanInput,
  RevisedPlan,
  LlmCallContext,
} from '../../application/ports/NovelTextGenerator';
import { STORY_LENGTH_PRESETS, StoryLength } from '../../domain/value-objects/StoryLength';

/** 設定書は人物追加の再生成などで長くなりやすいため、余裕を持たせる。 */
const METADATA_MAX_TOKENS = 8192;
/** プランは章アウトライン配列のため、再生成時に長くなりやすい。 */
const PLAN_MAX_TOKENS = 8192;
/** 未来章アウトラインと登場人物の改訂。 */
const PLAN_REVISION_MAX_TOKENS = 8192;

const CHARACTER_PROFILE_SCHEMA = {
  name: 'string',
  role: 'string',
  personality: 'string',
  background: 'string',
  goals: 'string',
  relationships: 'string',
  speechStyle: 'string (optional)',
  appearance: 'string (optional, 年齢感・体格・髪型・服装などの特徴を1文程度で)',
};

export type BedrockConversePhase =
  | 'generate_metadata'
  | 'generate_plan'
  | 'generate_chapter'
  | 'summarize_chapter'
  | 'revise_plan';

export interface BedrockConverseLogEvent {
  event: 'bedrock_converse';
  phase: BedrockConversePhase;
  modelId: string;
  storyId?: string;
  chapterIndex?: number;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  maxTokens: number;
  stopReason: string | null;
  success: boolean;
  errorName: string | null;
  errorMessage: string | null;
}

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
      '登場人物は性格・背景・目的・関係性・外見まで具体化し、地理・時代・時間経過ルール・一貫性制約を明確にしてください。',
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
            appearance: 'string (optional, 年齢感・体格・髪型・服装などの特徴を1文程度で)',
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
      '各文字列フィールドは簡潔に（目安: 1〜3文）。appearance は識別に足りる特徴だけを短く書き、長文の小説本文や重複説明は書かないでください。',
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

    const responseText = await this.converse(
      'generate_metadata',
      systemPrompt,
      sections.join('\n\n'),
      METADATA_MAX_TOKENS,
      input.callContext,
    );
    return this.parseJson<GeneratedMetadata>(responseText);
  }

  async generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは短編・中編小説の編集者兼プロットライターです。',
      '与えられた物語設定書（登場人物・世界観・時間軸・一貫性制約）に厳密に従い、小説の生成プランを作成してください。',
      '地理・時間経過・人物の性格/背景/関係性を矛盾させないこと。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      JSON.stringify({
        summary: 'string',
        theme: 'string',
        characters: [CHARACTER_PROFILE_SCHEMA],
        chapters: [{ index: 'number', title: 'string', outline: 'string' }],
      }),
      `章は${preset.chapterCountHint}を目安に、物語として一貫した構成にしてください。indexは1から始まる連番にしてください。`,
      `各章の本文はおよそ${preset.targetCharsPerChapter}を想定して、章立ての粒度を決めてください。`,
      'characters は設定書の登場人物を構造化プロフィールとして引き継ぎ、執筆時の正本となる配列にしてください（1人以上）。',
      'summary / theme は簡潔に。各章の outline は2〜4文程度に留め、本文そのものは書かないでください。',
      '各人物フィールドも簡潔に（目安: 1〜3文）。',
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
        'フィードバックを反映しつつ、各章 outline と人物プロフィールは簡潔に保ってください。',
      );
    }

    const responseText = await this.converse(
      'generate_plan',
      systemPrompt,
      sections.join('\n\n'),
      PLAN_MAX_TOKENS,
      input.callContext,
    );
    return this.parseJson<GeneratedPlan>(responseText);
  }

  async generateChapterText(input: GenerateChapterTextInput): Promise<string> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは小説家です。指定された章の本文のみを日本語で執筆してください。',
      '本文以外の説明・見出し・メタ情報は出力しないでください。',
      `この章の本文はおよそ${preset.targetCharsPerChapter}を目安に書いてください。`,
      '物語設定書の地理・時間ルール・一貫性制約を破ってはなりません。',
      '登場人物（性格・外見・話し方・関係性・目的を含む）はプラン側のプロフィールを正本としてください。',
      '渡された章立て（当該章までのプラン）における位置づけを守り、前後の章との時間・場所の連続性を維持してください。',
      'プランは執筆の道しるべであり、直前までの展開と自然につながる範囲で柔軟に書いて構いません。',
      'まだ渡されていない後続の章の展開を先取りしたり、無理に伏線を張りすぎたりしないでください。',
    ].join('\n');

    const sections = [
      '--- 物語設定書（破ってはならない前提。登場人物は含まない） ---',
      JSON.stringify(input.metadata),
      '--- 現在の登場人物（プラン。執筆の正本） ---',
      JSON.stringify(input.plan.characters),
      '--- 物語プラン（当該章まで。後続章は含まない） ---',
      JSON.stringify({
        summary: input.plan.summary,
        chapters: input.plan.chapters,
      }),
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

    return await this.converse(
      'generate_chapter',
      systemPrompt,
      sections.join('\n\n'),
      preset.chapterMaxTokens,
      input.callContext,
    );
  }

  async revisePlan(input: RevisePlanInput): Promise<RevisedPlan> {
    const expectedIndexes = input.futureChapters.map((c) => c.index);
    const systemPrompt = [
      'あなたは短編・中編小説の編集者兼プロットライターです。',
      '直前に完成した章の内容を踏まえ、まだ書いていない後続章の title / outline と、登場人物プロフィールを自然になるように更新してください。',
      'planSummary / planTheme / 設定書の consistencyNotes・world・timelineRules は変更禁止のアンカーです。物語の収束先・テーマを逸脱しないこと。',
      '章の追加・削除・並べ替え・indexの変更は禁止です。',
      '登場人物については次を許可します: 心境・目的・関係性の更新、重要な新登場人物の追加。',
      '既存の主要人物の name / 外見の大枠 / 話し方の核はむやみに変えないでください。性格のコアも維持しつつ、出来事による変化は goals / relationships / personality に反映して構いません。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      JSON.stringify({
        chapters: [{ index: 'number', title: 'string', outline: 'string' }],
        characters: [CHARACTER_PROFILE_SCHEMA],
      }),
      `chapters には index ${expectedIndexes.join(', ')} の章だけを、この順序で含めてください。それ以外の章は含めないでください。`,
      'characters は1人以上の配列とし、直前の章を反映した最新状態にしてください。',
      '各章の outline は2〜4文程度、各人物フィールドは1〜3文程度に留め、本文そのものは書かないでください。',
    ].join('\n');

    const sections = [
      '--- 物語設定書（破ってはならない前提。登場人物は含まない） ---',
      JSON.stringify({
        world: input.metadata.world,
        timelineRules: input.metadata.timelineRules,
        consistencyNotes: input.metadata.consistencyNotes,
        tone: input.metadata.tone,
        theme: input.metadata.theme,
        overview: input.metadata.overview,
      }),
      '--- 変更禁止のアンカー ---',
      JSON.stringify({ summary: input.planSummary, theme: input.planTheme }),
      '--- 直前に完成した章 ---',
      JSON.stringify(input.completedChapter),
      '--- 現在の登場人物（改訂対象） ---',
      JSON.stringify(input.characters),
      '--- 現在の後続章プラン（改訂対象） ---',
      JSON.stringify(input.futureChapters),
      `長さプリセット: ${input.length}`,
    ];

    const responseText = await this.converse(
      'revise_plan',
      systemPrompt,
      sections.join('\n\n'),
      PLAN_REVISION_MAX_TOKENS,
      input.callContext,
    );
    const parsed = this.parseJson<RevisedPlan>(responseText);
    if (!Array.isArray(parsed.chapters)) {
      throw new Error('revisePlan response missing chapters array');
    }
    if (!Array.isArray(parsed.characters) || parsed.characters.length === 0) {
      throw new Error('revisePlan response missing non-empty characters array');
    }
    return parsed;
  }

  async summarizeChapter(
    chapterText: string,
    length: StoryLength,
    callContext?: LlmCallContext,
  ): Promise<string> {
    const preset = STORY_LENGTH_PRESETS[length];
    const systemPrompt = [
      '次の章本文から、次の章を書く上で必要な重要ポイントを抽出してください。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      '{"characterStates": string, "unresolvedForeshadowing": string, "timeAndPlace": string, "keyEvents": string}',
      '各項目は簡潔な日本語で書いてください。本文そのものを繰り返さないでください。',
      'timeAndPlace には時刻・経過時間・季節・場所の相対関係を含めてください。',
    ].join('\n');

    const responseText = await this.converse(
      'summarize_chapter',
      systemPrompt,
      chapterText,
      preset.summaryMaxTokens,
      callContext,
    );
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
    phase: BedrockConversePhase,
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
    callContext?: LlmCallContext,
  ): Promise<string> {
    const startedAt = Date.now();
    try {
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

      this.logBedrockConverse({
        phase,
        callContext,
        durationMs: Date.now() - startedAt,
        maxTokens,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
        stopReason: result.stopReason ?? null,
        success: true,
        errorName: null,
        errorMessage: null,
      });

      return text;
    } catch (error) {
      const err = error as Error;
      this.logBedrockConverse({
        phase,
        callContext,
        durationMs: Date.now() - startedAt,
        maxTokens,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        stopReason: null,
        success: false,
        errorName: err.name ?? 'Error',
        errorMessage: err.message ?? String(error),
      });
      throw error;
    }
  }

  private logBedrockConverse(args: {
    phase: BedrockConversePhase;
    callContext?: LlmCallContext;
    durationMs: number;
    maxTokens: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    stopReason: string | null;
    success: boolean;
    errorName: string | null;
    errorMessage: string | null;
  }): void {
    const payload: BedrockConverseLogEvent = {
      event: 'bedrock_converse',
      phase: args.phase,
      modelId: this.modelId,
      storyId: args.callContext?.storyId,
      chapterIndex: args.callContext?.chapterIndex,
      durationMs: args.durationMs,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      maxTokens: args.maxTokens,
      stopReason: args.stopReason,
      success: args.success,
      errorName: args.errorName,
      errorMessage: args.errorMessage,
    };
    // CloudWatch Logs Insights でパースしやすいよう1行JSONにする。
    // アプリケーション層と同様、DOM lib 非依存のため globalThis 経由で出力する。
    const log = (globalThis as { console?: { log?: (...args: unknown[]) => void } }).console?.log;
    log?.(JSON.stringify(payload));
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
