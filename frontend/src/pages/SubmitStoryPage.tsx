import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, submitStory } from '../api/client';
import type { StoryLength, SubmitStoryInput } from '../api/types';
import { useAuth } from '../auth/AuthContext';

const initialForm: SubmitStoryInput = {
  overview: '',
  theme: '',
  characters: '',
  tone: '',
  setting: '',
  requireMetadataApproval: true,
  requirePlanApproval: true,
  requireChapterApproval: false,
  requireFinalApproval: true,
  length: 'short',
};

export function SubmitStoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<SubmitStoryInput>(initialForm);

  const mutation = useMutation({
    mutationFn: () => submitStory(form),
    onSuccess: (output) => {
      navigate(`/stories/${output.storyId}`);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate();
  };

  const update = <K extends keyof SubmitStoryInput>(key: K, value: SubmitStoryInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="page">
      <h1>物語を送信する</h1>
      <p className="page__lead">
        概要・テーマ・登場人物を入力すると、設定書 → プラン → 各章本文 → 最終原稿の順に生成が進みます。
        送信後に表示されるページのURLで、いつでも進行状況を確認できます。完成通知は
        {user ? <strong> {user.email} </strong> : ' '}
        宛に送られます。
      </p>

      <form className="card story-form" onSubmit={handleSubmit}>
        <label htmlFor="overview">概要（必須）</label>
        <textarea
          id="overview"
          required
          rows={3}
          value={form.overview}
          onChange={(event) => update('overview', event.target.value)}
          placeholder="例: 孤島の灯台守が嵐の夜に漂流者を拾う"
        />

        <label htmlFor="theme">テーマ（必須）</label>
        <input
          id="theme"
          required
          type="text"
          value={form.theme}
          onChange={(event) => update('theme', event.target.value)}
          placeholder="例: 孤独と赦し"
        />

        <label htmlFor="characters">登場人物（必須）</label>
        <textarea
          id="characters"
          required
          rows={2}
          value={form.characters}
          onChange={(event) => update('characters', event.target.value)}
          placeholder="例: 灯台守・アキラ、漂流者・ユキ"
        />

        <label htmlFor="tone">トーン（任意）</label>
        <input
          id="tone"
          type="text"
          value={form.tone}
          onChange={(event) => update('tone', event.target.value)}
          placeholder="例: 静謐で少し不気味"
        />

        <label htmlFor="setting">舞台設定（任意）</label>
        <input
          id="setting"
          type="text"
          value={form.setting}
          onChange={(event) => update('setting', event.target.value)}
          placeholder="例: 孤島の灯台"
        />

        <label htmlFor="length">長さ</label>
        <select
          id="length"
          value={form.length}
          onChange={(event) => update('length', event.target.value as StoryLength)}
        >
          <option value="short">短編</option>
          <option value="medium">中編</option>
        </select>

        <fieldset className="approval-flags">
          <legend>承認ゲート</legend>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.requireMetadataApproval}
              onChange={(event) => update('requireMetadataApproval', event.target.checked)}
            />
            設定書の承認を求める
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.requirePlanApproval}
              onChange={(event) => update('requirePlanApproval', event.target.checked)}
            />
            プランの承認を求める
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.requireChapterApproval}
              onChange={(event) => update('requireChapterApproval', event.target.checked)}
            />
            各章の承認を求める
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.requireFinalApproval}
              onChange={(event) => update('requireFinalApproval', event.target.checked)}
            />
            最終原稿の承認を求める
          </label>
        </fieldset>

        <button type="submit" className="btn btn--primary" disabled={mutation.isPending}>
          {mutation.isPending ? '送信中…' : '生成を開始する'}
        </button>

        {mutation.isError && (
          <p className="field-error">
            {mutation.error instanceof ApiError ? mutation.error.message : '送信に失敗しました。時間をおいて再度お試しください。'}
          </p>
        )}
      </form>

      <p className="auth-form__switch">
        <Link to="/me/stories">これまで送信した物語を見る</Link>
      </p>
    </div>
  );
}
