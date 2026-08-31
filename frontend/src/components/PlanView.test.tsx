import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isUserFacingForbiddenDevelopment, PlanView } from './PlanView';

describe('isUserFacingForbiddenDevelopment', () => {
  it('hides Lambda Cause JSON dumps', () => {
    expect(
      isUserFacingForbiddenDevelopment(
        '{"errorType":"ContradictionDetectedError","errorMessage":"boom","trace":["at GenerateChapter"]}',
      ),
    ).toBe(false);
  });

  it('keeps human-readable forbidden developments', () => {
    expect(
      isUserFacingForbiddenDevelopment(
        '第2章の生成で、これまでの設定と矛盾する内容が見つかりました。',
      ),
    ).toBe(true);
  });
});

describe('PlanView', () => {
  it('does not list technical error dumps under 禁止展開', () => {
    render(
      <PlanView
        plan={{
          summary: 's',
          theme: 't',
          characters: [],
          chapters: [{ index: 1, title: '出会い', outline: 'o1' }],
          roughBeats: [],
          forbiddenDevelopments: [
            '{"errorType":"Error","errorMessage":"stack"}',
            '剣を失ったあとに同じ剣を所持する展開',
          ],
        }}
      />,
    );

    expect(screen.getByText('剣を失ったあとに同じ剣を所持する展開')).toBeInTheDocument();
    expect(screen.queryByText(/errorType/)).not.toBeInTheDocument();
  });
});
