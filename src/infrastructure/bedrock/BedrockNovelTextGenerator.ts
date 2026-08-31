import {
  BedrockRuntimeClient,
  ConverseCommand,
  OutputFormatType,
} from '@aws-sdk/client-bedrock-runtime';
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
  ExtractAtomicFactsInput,
  ExtractedAtomicFacts,
  DetectContradictionsInput,
  ContradictionCheckResult,
  ExpandChapterOutlineInput,
  ExpandedChapterOutline,
  RealignFuturePlanInput,
  RealignedFuturePlan,
} from '../../application/ports/NovelTextGenerator';
import { UsageRecorder } from '../../application/ports/UsageAccountRepository';
import { STORY_LENGTH_PRESETS, StoryLength } from '../../domain/value-objects/StoryLength';
import { calculateUsageCostUsd } from '../../domain/value-objects/BedrockPricing';
import {
  ATOMIC_FACTS_EXTRACTION_SCHEMA,
  CHAPTER_SUMMARY_SCHEMA,
  CONTRADICTION_CHECK_SCHEMA,
  EXPANDED_CHAPTER_OUTLINE_SCHEMA,
  GENERATED_METADATA_SCHEMA,
  GENERATED_PLAN_SCHEMA,
  JsonSchemaObject,
  REALIGNED_FUTURE_PLAN_SCHEMA,
  REVISED_PLAN_SCHEMA,
  schemaToJsonString,
} from './schemas/jsonSchemas';

/** 設定書は人物追加の再生成などで長くなりやすいため、余裕を持たせる。 */
const METADATA_MAX_TOKENS = 8192;
/** プランは章アウトライン配列のため、再生成時に長くなりやすい。 */
const PLAN_MAX_TOKENS = 8192;
/** 未来章アウトラインと登場人物の改訂。 */
const PLAN_REVISION_MAX_TOKENS = 8192;
const FACT_EXTRACTION_MAX_TOKENS = 4096;
const CONTRADICTION_MAX_TOKENS = 2048;
const EXPAND_OUTLINE_MAX_TOKENS = 4096;

export type BedrockConversePhase =
  | 'generate_metadata'
  | 'generate_plan'
  | 'generate_chapter'
  | 'summarize_chapter'
  | 'revise_plan'
  | 'extract_atomic_facts'
  | 'detect_contradictions'
  | 'expand_chapter_outline'
  | 'realign_future_plan';

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
  structuredOutput: boolean;
}

/**
 * Bedrock (Claude Sonnet) を使ったテキスト生成アダプタ。
 * 構造化フェーズは Converse outputConfig.json_schema でスキーマを強制する。
 */
export class BedrockNovelTextGenerator implements NovelTextGenerator {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
    /** 未指定時は使用量記録をスキップする（テスト・後方互換のため任意）。 */
    private readonly usageRecorder?: UsageRecorder,
  ) {}

  async generateMetadata(input: GenerateMetadataInput): Promise<GeneratedMetadata> {
    const systemPrompt = [
      'あなたは短編・中編小説の編集者兼設定担当です。',
      'ユーザーが与えた概要・テーマ・登場人物などのシード情報を元に、執筆の正本となる物語設定書を作成してください。',
      '登場人物は性格・背景・目的・関係性・外見まで具体化し、地理・時代・時間経過ルール・一貫性制約を明確にしてください。',
      'characters は1人以上。シードにない情報は物語として自然な範囲で補完して構いません。',
      '各文字列フィールドは簡潔に（目安: 1〜3文）。appearance は識別に足りる特徴だけを短く書き、長文の小説本文や重複説明は書かないでください。',
      'speechStyle / appearance / socialContext は該当がなければ空文字にしてください。',
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

    return await this.converseJson<GeneratedMetadata>(
      'generate_metadata',
      systemPrompt,
      sections.join('\n\n'),
      METADATA_MAX_TOKENS,
      GENERATED_METADATA_SCHEMA,
      'generated_metadata',
      input.callContext,
    );
  }

  async generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは短編・中編小説の編集者兼プロットライターです。',
      '与えられた物語設定書（登場人物・世界観・時間軸・一貫性制約）に厳密に従い、小説の生成プランを作成してください。',
      '地理・時間経過・人物の性格/背景/関係性を矛盾させないこと。',
      `章は${preset.chapterCountHint}を目安に、物語として一貫した構成にしてください。indexは1から始まる連番にしてください。`,
      `各章の本文はおよそ${preset.targetCharsPerChapter}を想定して、章立ての粒度を決めてください。`,
      'characters は設定書の登場人物を構造化プロフィールとして引き継ぎ、執筆時の正本となる配列にしてください（1人以上）。',
      'summary / theme は簡潔に。各章の outline は2〜4文程度に留め、本文そのものは書かないでください。',
      '各人物フィールドも簡潔に（目安: 1〜3文）。speechStyle / appearance は該当がなければ空文字。',
      'roughBeats には起承転結（または同等の物語骨格）を抽象ビートとして入れてください。',
      '各 beat の chapterIndexes で対応する章番号を示し、全章がいずれかの beat に属するようにしてください。',
      'roughBeats.summary は1〜2文の粗い説明に留め、章の詳細 outline より抽象度を高くしてください。',
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
          roughBeats: input.previousPlan.roughBeats,
        }),
        '--- ユーザーからの修正フィードバック ---',
        input.feedback,
        '上記フィードバックを反映して、プラン全体を改めて作成してください。設定書との矛盾は作らないでください。',
        'フィードバックを反映しつつ、各章 outline と人物プロフィールは簡潔に保ってください。',
      );
    }

    return await this.converseJson<GeneratedPlan>(
      'generate_plan',
      systemPrompt,
      sections.join('\n\n'),
      PLAN_MAX_TOKENS,
      GENERATED_PLAN_SCHEMA,
      'generated_plan',
      input.callContext,
    );
  }

  async generateChapterText(input: GenerateChapterTextInput): Promise<string> {
    const preset = STORY_LENGTH_PRESETS[input.length];
    const systemPrompt = [
      'あなたは小説家です。指定された章の本文のみを日本語で執筆してください。',
      '本文以外の説明・見出し・メタ情報は出力しないでください。',
      `この章の本文はおよそ${preset.targetCharsPerChapter}を目安に書いてください。`,
      '物語設定書の地理・時間ルール・一貫性制約を破ってはなりません。',
      '登場人物（性格・外見・話し方・関係性・目的を含む）はプラン側のプロフィールを正本としてください。',
      '渡された粗い全体構造（未来の粗アウトライン）を意識しつつ、今の章の詳細アウトラインに従って書いてください。',
      '未来章の細部を先取りしたり、無理に伏線を張りすぎたりしないでください。',
      '同一の内省や同一動作の反復は避け、段落間で物語を前進させてください。',
      input.discoursePlan
        ? `ディスコース構成の目安: ${JSON.stringify(input.discoursePlan)}`
        : '',
      input.dialogueToNarrationRatio
        ? `会話と地の文の比率の目安: ${input.dialogueToNarrationRatio}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const sections = [
      '--- 物語設定書（破ってはならない前提。登場人物は含まない） ---',
      JSON.stringify(input.metadata),
      '--- 現在の登場人物（プラン。執筆の正本） ---',
      JSON.stringify(input.plan.characters),
      '--- 物語の粗い全体構造（未来含む） ---',
      JSON.stringify({
        summary: input.plan.summary,
        roughBeats: input.plan.roughBeats ?? [],
        futureRoughOutlines: input.plan.futureRoughOutlines ?? [],
      }),
      '--- 当該章までの詳細アウトライン ---',
      JSON.stringify(input.plan.chapters),
      `この章の番号: ${input.chapterOutline.index}`,
      `この章のタイトル: ${input.chapterOutline.title}`,
      `この章で描くべき内容: ${input.chapterOutline.outline}`,
    ];
    if (input.activeFacts && input.activeFacts.length > 0) {
      sections.push('--- 現在有効な事実（矛盾させてはならない） ---', JSON.stringify(input.activeFacts));
    }
    if (input.previousSceneSummary) {
      sections.push(`直前の章の短い場面要約: ${input.previousSceneSummary}`);
    }
    if (input.revisionInstruction) {
      sections.push(`改訂指示（この内容を必ず反映して書き直してください）: ${input.revisionInstruction}`);
    }
    if (input.forbiddenDevelopments && input.forbiddenDevelopments.length > 0) {
      sections.push('--- 禁止されている展開 ---', JSON.stringify(input.forbiddenDevelopments));
    }

    return await this.converseText(
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
      `chapters には index ${expectedIndexes.join(', ')} の章だけを、この順序で含めてください。それ以外の章は含めないでください。`,
      'characters は1人以上の配列とし、直前の章を反映した最新状態にしてください。',
      '各章の outline は2〜4文程度、各人物フィールドは1〜3文程度に留め、本文そのものは書かないでください。',
      'speechStyle / appearance は該当がなければ空文字。',
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
    if (input.forbiddenDevelopments && input.forbiddenDevelopments.length > 0) {
      sections.push('--- 禁止されている展開 ---', JSON.stringify(input.forbiddenDevelopments));
    }

    const parsed = await this.converseJson<RevisedPlan>(
      'revise_plan',
      systemPrompt,
      sections.join('\n\n'),
      PLAN_REVISION_MAX_TOKENS,
      REVISED_PLAN_SCHEMA,
      'revised_plan',
      input.callContext,
    );
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
      '各項目は簡潔な日本語で書いてください。本文そのものを繰り返さないでください。',
      'timeAndPlace には時刻・経過時間・季節・場所の相対関係を含めてください。',
    ].join('\n');

    const parsed = await this.converseJson<{
      characterStates: string;
      unresolvedForeshadowing: string;
      timeAndPlace: string;
      keyEvents: string;
    }>(
      'summarize_chapter',
      systemPrompt,
      chapterText,
      preset.summaryMaxTokens,
      CHAPTER_SUMMARY_SCHEMA,
      'chapter_summary',
      callContext,
    );

    return [
      `登場人物の状態: ${parsed.characterStates}`,
      `未解決の伏線: ${parsed.unresolvedForeshadowing}`,
      `時間・場所: ${parsed.timeAndPlace}`,
      `重要イベント: ${parsed.keyEvents}`,
    ].join('\n');
  }

  async extractAtomicFacts(input: ExtractAtomicFactsInput): Promise<ExtractedAtomicFacts> {
    const systemPrompt = [
      '章本文からアトミックな事実とエンティティを抽出してください。',
      '事実は主語・述語・目的語に分解し、方向性のある短い命題にしてください。',
      'entityId は英数字とハイフンのみの安定ID（例: char-hero, item-sword）にしてください。',
      `validFromChapter は ${input.chapterIndex} にしてください。`,
      'validToChapter はまだ有効なら null。既に無効なら終了章番号。',
      'sceneSummary は次章接続用の短い場面要約（2〜4文）にしてください。',
      'supersedes は今回の事実が置き換える既存 factId があれば列挙、なければ空配列。',
    ].join('\n');

    const sections = [
      `章番号: ${input.chapterIndex}`,
      '--- 章本文 ---',
      input.chapterText,
      '--- 既知エンティティ ---',
      JSON.stringify(input.knownEntities ?? []),
    ];

    return await this.converseJson<ExtractedAtomicFacts>(
      'extract_atomic_facts',
      systemPrompt,
      sections.join('\n\n'),
      FACT_EXTRACTION_MAX_TOKENS,
      ATOMIC_FACTS_EXTRACTION_SCHEMA,
      'atomic_facts_extraction',
      input.callContext,
    );
  }

  async detectContradictions(input: DetectContradictionsInput): Promise<ContradictionCheckResult> {
    const systemPrompt = [
      '新しい事実が、既存の有効な事実と論理的に矛盾していないか判定してください。',
      '文体の違いや言い換えは矛盾としないでください。',
      '所有物の喪失後の使用、死亡した人物の生存行動、確定した時系列の逆転などは矛盾です。',
      'hasContradiction=true のとき contradictions に具体を列挙してください。',
    ].join('\n');

    const sections = [
      '--- 既存の有効な事実 ---',
      JSON.stringify(input.activeFacts),
      '--- 新しい事実 ---',
      JSON.stringify(input.newFacts),
    ];

    return await this.converseJson<ContradictionCheckResult>(
      'detect_contradictions',
      systemPrompt,
      sections.join('\n\n'),
      CONTRADICTION_MAX_TOKENS,
      CONTRADICTION_CHECK_SCHEMA,
      'contradiction_check',
      input.callContext,
    );
  }

  async expandChapterOutline(input: ExpandChapterOutlineInput): Promise<ExpandedChapterOutline> {
    const systemPrompt = [
      '粗いビートと現在の世界状態を踏まえ、今書く章の詳細アウトラインを展開してください。',
      'outline は2〜6文。本文は書かないでください。',
      'discoursePlan は段落役割の目安（theme/elaboration/contrast/result/dialogue/description）。',
      'dialogueToNarrationRatio は会話と地の文の比率の目安（例: 会話3:地の文7）。',
      '禁止展開は避けてください。',
    ].join('\n');

    const sections = [
      `章番号: ${input.chapterIndex}`,
      '--- 粗いビート ---',
      JSON.stringify(input.roughBeat),
      '--- 現在の粗い章メモ ---',
      JSON.stringify(input.currentOutline),
      '--- 有効な事実 ---',
      JSON.stringify(input.activeFacts),
      '--- 登場人物 ---',
      JSON.stringify(input.characters),
      '--- 禁止展開 ---',
      JSON.stringify(input.forbiddenDevelopments ?? []),
      `長さプリセット: ${input.length}`,
    ];

    return await this.converseJson<ExpandedChapterOutline>(
      'expand_chapter_outline',
      systemPrompt,
      sections.join('\n\n'),
      EXPAND_OUTLINE_MAX_TOKENS,
      EXPANDED_CHAPTER_OUTLINE_SCHEMA,
      'expanded_chapter_outline',
      input.callContext,
    );
  }

  async realignFuturePlan(input: RealignFuturePlanInput): Promise<RealignedFuturePlan> {
    const expectedIndexes = input.futureChapters.map((c) => c.index);
    const systemPrompt = [
      '完了した章と現在の世界状態を踏まえ、未執筆部分の粗いビートと詳細アウトライン、登場人物を再整合してください。',
      'planSummary / planTheme は変更禁止。',
      '章の追加・削除・並べ替え・index変更は禁止。',
      `chapters には index ${expectedIndexes.join(', ')} のみをこの順序で含めてください。`,
      'roughBeats は全編の粗い骨格を維持しつつ、未執筆側を必要なら更新してください。',
      '禁止展開は避けてください。',
      'speechStyle / appearance は該当がなければ空文字。',
    ].join('\n');

    const sections = [
      '--- アンカー ---',
      JSON.stringify({ summary: input.planSummary, theme: input.planTheme }),
      '--- 設定書制約 ---',
      JSON.stringify(input.metadata),
      '--- 完了した章 ---',
      JSON.stringify(input.completedChapter),
      '--- 現在の粗いビート ---',
      JSON.stringify(input.roughBeats),
      '--- 未執筆の詳細アウトライン ---',
      JSON.stringify(input.futureChapters),
      '--- 登場人物 ---',
      JSON.stringify(input.characters),
      '--- 有効な事実 ---',
      JSON.stringify(input.activeFacts),
      '--- 禁止展開 ---',
      JSON.stringify(input.forbiddenDevelopments ?? []),
      `長さプリセット: ${input.length}`,
    ];

    return await this.converseJson<RealignedFuturePlan>(
      'realign_future_plan',
      systemPrompt,
      sections.join('\n\n'),
      PLAN_REVISION_MAX_TOKENS,
      REALIGNED_FUTURE_PLAN_SCHEMA,
      'realigned_future_plan',
      input.callContext,
    );
  }

  private async converseJson<T>(
    phase: BedrockConversePhase,
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
    schema: JsonSchemaObject,
    schemaName: string,
    callContext?: LlmCallContext,
  ): Promise<T> {
    const text = await this.converse(
      phase,
      systemPrompt,
      userContent,
      maxTokens,
      callContext,
      {
        type: OutputFormatType.JSON_SCHEMA,
        structure: {
          jsonSchema: {
            schema: schemaToJsonString(schema),
            name: schemaName,
          },
        },
      },
    );
    return this.parseJson<T>(text);
  }

  private async converseText(
    phase: BedrockConversePhase,
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
    callContext?: LlmCallContext,
  ): Promise<string> {
    return this.converse(phase, systemPrompt, userContent, maxTokens, callContext);
  }

  private async converse(
    phase: BedrockConversePhase,
    systemPrompt: string,
    userContent: string,
    maxTokens: number,
    callContext?: LlmCallContext,
    textFormat?: {
      type: typeof OutputFormatType.JSON_SCHEMA;
      structure: { jsonSchema: { schema: string; name: string } };
    },
  ): Promise<string> {
    const startedAt = Date.now();
    const structuredOutput = Boolean(textFormat);
    try {
      const result = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: systemPrompt }],
          messages: [{ role: 'user', content: [{ text: userContent }] }],
          inferenceConfig: { maxTokens, temperature: 0.7 },
          ...(textFormat
            ? {
                outputConfig: {
                  textFormat,
                },
              }
            : {}),
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
        structuredOutput,
      });

      await this.recordUsageBestEffort(
        phase,
        callContext,
        result.usage?.inputTokens ?? 0,
        result.usage?.outputTokens ?? 0,
      );

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
        structuredOutput,
      });
      throw error;
    }
  }

  /**
   * 使用量記録はベストエフォート。記録に失敗しても生成処理自体は継続する
   * （SES送信失敗時にワークフローを止めない既存方針と同じ考え方）。
   */
  private async recordUsageBestEffort(
    phase: BedrockConversePhase,
    callContext: LlmCallContext | undefined,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    if (!this.usageRecorder || !callContext?.userEmail) {
      return;
    }
    try {
      await this.usageRecorder.recordUsage(callContext.userEmail, {
        storyId: callContext.storyId,
        chapterIndex: callContext.chapterIndex,
        phase,
        modelId: this.modelId,
        inputTokens,
        outputTokens,
        costUsd: calculateUsageCostUsd(this.modelId, inputTokens, outputTokens),
      });
    } catch (error) {
      console.error('Failed to record Bedrock usage', error);
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
    structuredOutput: boolean;
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
      structuredOutput: args.structuredOutput,
    };
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
