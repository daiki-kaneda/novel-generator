import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  NovelTextGenerator,
  GeneratePlanInput,
  GeneratedPlan,
  GenerateChapterTextInput,
  ProposeRevisionPlanInput,
} from '../../application/ports/NovelTextGenerator';
import { ChapterRevisionInstruction } from '../../domain/services/RevisionScopePolicy';

const DEFAULT_MAX_TOKENS = 4096;
const CHAPTER_MAX_TOKENS = 8192;

/**
 * Bedrock (Claude Sonnet) を使ったテキスト生成アダプタ。
 * プラン生成・章生成・要約生成・改訂プラン提案のすべてで、Bedrockの
 * Converse APIを共通のクライアントで呼び出す。
 */
export class BedrockNovelTextGenerator implements NovelTextGenerator {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
  ) {}

  async generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan> {
    const systemPrompt = [
      'あなたは短編小説の編集者兼プロットライターです。',
      '与えられた概要・テーマ・登場人物・文調から、短編小説の生成プランを作成してください。',
      '出力は必ず次のJSON形式のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      '{"summary": string, "theme": string, "characters": string, "chapters": [{"index": number, "title": string, "outline": string}]}',
      '章は3〜8章程度を目安に、物語として一貫した構成にしてください。indexは1から始まる連番にしてください。',
    ].join('\n');

    const sections = [
      `概要: ${input.overview}`,
      `テーマ: ${input.theme}`,
      `登場人物: ${input.characters}`,
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
    const systemPrompt = [
      'あなたは短編小説家です。指定された章の本文のみを日本語で執筆してください。',
      '本文以外の説明・見出し・メタ情報は出力しないでください。',
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

    return await this.converse(systemPrompt, sections.join('\n\n'), CHAPTER_MAX_TOKENS);
  }

  async summarizeChapter(chapterText: string): Promise<string> {
    const systemPrompt = [
      '次の章本文から、次の章を書く上で必要な重要ポイント（登場人物の状態変化、伏線、時間・場所など）を',
      '簡潔な日本語の文章で要約してください。本文そのものを繰り返さないでください。',
    ].join('\n');

    return await this.converse(systemPrompt, chapterText, DEFAULT_MAX_TOKENS);
  }

  async proposeRevisionPlan(
    input: ProposeRevisionPlanInput,
  ): Promise<ChapterRevisionInstruction[]> {
    const systemPrompt = [
      'あなたは小説編集者です。ユーザーからの最終原稿への修正フィードバックを読み、',
      'どの章（indexで指定）をどのように改訂すべきかを提案してください。',
      '出力は必ず次のJSON形式の配列のみで返してください（説明文やマークダウンのコードブロックは付けないこと）。',
      '[{"chapterIndex": number, "instruction": string}]',
      'フィードバックと関係のない章は含めないでください。',
    ].join('\n');

    const userContent = [
      `フィードバック: ${input.feedback}`,
      '--- 章一覧 ---',
      JSON.stringify(input.chapters),
    ].join('\n\n');

    const responseText = await this.converse(systemPrompt, userContent, DEFAULT_MAX_TOKENS);
    return this.parseJson<ChapterRevisionInstruction[]>(responseText);
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
