#!/usr/bin/env npx ts-node
/**
 * 評価ラウンド1のシードを POST /stories へ投入する。
 *
 * 用法:
 *   API_BASE_URL=https://xxxx.execute-api.ap-northeast-1.amazonaws.com \
 *   EVAL_USER_EMAIL=you@example.com \
 *   npx ts-node eval/submit-round1.ts
 *
 * オプション:
 *   DRY_RUN=1  … リクエスト本文を表示するのみ（送信しない）
 *   SEED_IDS=A1-modern-drama,B4-closed-mystery  … 指定 id のみ
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface SeedStory {
  id: string;
  length: 'short' | 'medium';
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  setting?: string;
}

interface SeedFile {
  defaults: {
    requireMetadataApproval: boolean;
    requirePlanApproval: boolean;
    requireChapterApproval: boolean;
    requireFinalApproval: boolean;
  };
  stories: SeedStory[];
}

async function main(): Promise<void> {
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, '');
  const userEmail = process.env.EVAL_USER_EMAIL;
  const dryRun = process.env.DRY_RUN === '1';
  const onlyIds = process.env.SEED_IDS
    ? new Set(process.env.SEED_IDS.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  if (!dryRun && !apiBase) {
    throw new Error('API_BASE_URL is required (or set DRY_RUN=1)');
  }
  if (!userEmail) {
    throw new Error('EVAL_USER_EMAIL is required');
  }

  const seedPath = path.join(__dirname, 'round1-seeds.json');
  const seedFile = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as SeedFile;
  const stories = seedFile.stories.filter((s) => !onlyIds || onlyIds.has(s.id));

  const results: Array<{ id: string; storyId?: string; error?: string }> = [];

  for (const story of stories) {
    const body = {
      overview: story.overview,
      theme: story.theme,
      characters: story.characters,
      tone: story.tone,
      setting: story.setting,
      length: story.length,
      userEmail,
      ...seedFile.defaults,
    };

    if (dryRun) {
      console.log(JSON.stringify({ seedId: story.id, body }, null, 2));
      results.push({ id: story.id, storyId: '(dry-run)' });
      continue;
    }

    try {
      const res = await fetch(`${apiBase}/stories`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        results.push({ id: story.id, error: `${res.status} ${text}` });
        console.error(`[FAIL] ${story.id}: ${res.status} ${text}`);
        continue;
      }
      const parsed = JSON.parse(text) as { storyId: string };
      results.push({ id: story.id, storyId: parsed.storyId });
      console.log(`[OK] ${story.id} -> ${parsed.storyId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id: story.id, error: message });
      console.error(`[FAIL] ${story.id}: ${message}`);
    }
  }

  const outPath = path.join(__dirname, 'round1-submitted.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify({ submittedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
