import type { StoryStatusOutput } from '../api/types';

export function PlanView({ plan }: { plan: NonNullable<StoryStatusOutput['plan']> }) {
  return (
    <div className="card">
      <h3>プラン</h3>
      <dl className="kv-list">
        <dt>概要</dt>
        <dd>{plan.summary}</dd>
        <dt>テーマ</dt>
        <dd>{plan.theme}</dd>
      </dl>

      {plan.forbiddenDevelopments.length > 0 && (
        <>
          <h4>禁止展開</h4>
          <ul>
            {plan.forbiddenDevelopments.map((item) => (
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
