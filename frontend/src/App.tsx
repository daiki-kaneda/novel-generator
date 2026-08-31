import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SubmitStoryPage } from './pages/SubmitStoryPage';
import { StoryStatusPage } from './pages/StoryStatusPage';
import { ChapterReaderPage } from './pages/ChapterReaderPage';
import { MyStoriesPage } from './pages/MyStoriesPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ConfirmSignupPage } from './pages/ConfirmSignupPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function HeaderNav() {
  const { status, user, signOut } = useAuth();

  if (status !== 'authenticated') {
    return (
      <nav className="app-nav">
        <Link to="/login">ログイン</Link>
        <Link to="/signup">新規登録</Link>
      </nav>
    );
  }

  return (
    <nav className="app-nav">
      <Link to="/me/stories">マイストーリー</Link>
      <span className="app-nav__user">{user?.email}</span>
      <button type="button" className="btn btn--secondary btn--small" onClick={signOut}>
        ログアウト
      </button>
    </nav>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <div className="app-shell">
            <header className="app-header">
              <Link to="/" className="app-title">
                短編小説生成ワークフロー
              </Link>
              <HeaderNav />
            </header>
            <main className="app-main">
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/confirm" element={<ConfirmSignupPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <SubmitStoryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/me/stories"
                  element={
                    <ProtectedRoute>
                      <MyStoriesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/stories/:storyId"
                  element={
                    <ProtectedRoute>
                      <StoryStatusPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/stories/:storyId/chapters/:chapterIndex"
                  element={
                    <ProtectedRoute>
                      <ChapterReaderPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <footer className="app-footer">
              <p>ログインしたユーザー自身が送信した物語のみ閲覧・承認できます。</p>
            </footer>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
