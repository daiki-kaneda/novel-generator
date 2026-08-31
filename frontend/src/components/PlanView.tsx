import type { StoryStatusOutput } from '../api/types';

/** 補償時に誤って載った Lambda スタック JSON などはプラン画面に出さない。 */
export function isUserFacingForbiddenDevelopment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (/"error(Type|Message)"/.test(trimmed) || trimmed.includes('\n    at ')) {
    return false;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return false;
  }
  return true;
}

export function PlanView({ plan }: { plan: NonNullable<StoryStatusOutput['plan']> }) {
  const forbiddenDevelopments = plan.forbiddenDevelopments.filter(isUserFacingForbiddenDevelopment);

  return (
    <div className="card">
      <h3>プラン</h3>
      <dl className="kv-list">
        <dt>概要</dt>
        <dd>{plan.summary}</dd>
        <dt>テーマ</dt>
        <dd>{plan.theme}</dd>
      </dl>

      {forbiddenDevelopments.length > 0 && (
        <>
          <h4>禁止展開</h4>
          <ul>
            {forbiddenDevelopments.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      <h4>章構成</h4>
      <ol className="chapter-outline-list">
        {plan.chapters.map((chapter) => (
          <li key={chapter.index}>
            <p className="chapter-outline-list__title">
              第{chapter.index}章 {chapter.title}
            </p>
            <p className="chapter-outline-list__outline">{chapter.outline}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
