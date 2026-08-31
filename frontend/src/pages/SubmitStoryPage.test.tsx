import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../auth/AuthContext';
import { SubmitStoryPage } from './SubmitStoryPage';

function renderPage() {
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    user: { email: 'user@example.com' },
    signUp: vi.fn(),
    confirmSignUp: vi.fn(),
    resendConfirmationCode: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as ReturnType<typeof useAuth>);

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

  it('shows the signed-in user email as the completion notification recipient', () => {
    renderPage();

    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });
});
