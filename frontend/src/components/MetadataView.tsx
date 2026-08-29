import type { StoryStatusOutput } from '../api/types';

export function MetadataView({ metadata }: { metadata: NonNullable<StoryStatusOutput['metadata']> }) {
  return (
    <div className="card">
      <h3>設定書</h3>
      <dl className="kv-list">
        <dt>概要</dt>
        <dd>{metadata.overview}</dd>
        <dt>テーマ</dt>
        <dd>{metadata.theme}</dd>
        <dt>トーン</dt>
        <dd>{metadata.tone}</dd>
        <dt>世界観</dt>
        <dd>
          {metadata.world.geography} / {metadata.world.timePeriod}
          {metadata.world.socialContext ? ` / ${metadata.world.socialContext}` : ''}
        </dd>
        <dt>時間軸のルール</dt>
        <dd>{metadata.timelineRules}</dd>
        <dt>一貫性の制約</dt>
        <dd>{metadata.consistencyNotes}</dd>
      </dl>

      <h4>登場人物</h4>
      <ul className="character-list">
        {metadata.characters.map((character) => (
          <li key={character.name} className="character-card">
            <p className="character-card__name">
              {character.name}
              <span className="character-card__role">{character.role}</span>
            </p>
            <p>性格: {character.personality}</p>
            <p>背景: {character.background}</p>
            <p>目的: {character.goals}</p>
            <p>関係: {character.relationships}</p>
            {character.appearance && <p>外見: {character.appearance}</p>}
            {character.speechStyle && <p>話し方: {character.speechStyle}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
