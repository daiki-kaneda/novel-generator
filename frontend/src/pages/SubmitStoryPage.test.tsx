import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SubmitStoryPage } from './SubmitStoryPage';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SubmitStoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SubmitStoryPage', () => {
  it('renders all required form fields', () => {
    renderPage();

    expect(screen.getByLabelText(/概要/)).toBeInTheDocument();
    expect(screen.getByLabelText('テーマ（必須）')).toBeInTheDocument();
    expect(screen.getByLabelText(/登場人物/)).toBeInTheDocument();
    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    expect(screen.getByLabelText('長さ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成を開始する' })).toBeInTheDocument();
  });

  it('defaults the approval gate checkboxes to match SubmitStoryUseCase defaults', () => {
    renderPage();

    expect(screen.getByLabelText('設定書の承認を求める')).toBeChecked();
    expect(screen.getByLabelText('プランの承認を求める')).toBeChecked();
    expect(screen.getByLabelText('各章の承認を求める')).not.toBeChecked();
    expect(screen.getByLabelText('最終原稿の承認を求める')).toBeChecked();
  });

  it('does not show the recent stories history when localStorage is empty', () => {
    renderPage();

    expect(screen.queryByText('このブラウザで送信した物語')).not.toBeInTheDocument();
  });
});
