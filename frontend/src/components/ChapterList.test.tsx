import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ChapterList } from './ChapterList';

describe('ChapterList', () => {
  it('links generated chapters to the in-app reader', () => {
    render(
      <MemoryRouter>
        <ChapterList
          storyId="story-1"
          chapters={[
            { index: 1, title: '出会い', status: 'DONE' },
            { index: 2, title: '嵐', status: 'PENDING' },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '本文を読む' })).toHaveAttribute(
      'href',
      '/stories/story-1/chapters/1',
    );
    expect(screen.getAllByRole('link', { name: '本文を読む' })).toHaveLength(1);
  });
});
