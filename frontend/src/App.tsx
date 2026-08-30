import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { SubmitStoryPage } from './pages/SubmitStoryPage';
import { StoryStatusPage } from './pages/StoryStatusPage';
import { ChapterReaderPage } from './pages/ChapterReaderPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app-shell">
          <header className="app-header">
            <Link to="/" className="app-title">
              短編小説生成ワークフロー
            </Link>
          </header>
          <main className="app-main">
            <Routes>
              <Route path="/" element={<SubmitStoryPage />} />
              <Route path="/stories/:storyId" element={<StoryStatusPage />} />
              <Route path="/stories/:storyId/chapters/:chapterIndex" element={<ChapterReaderPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <footer className="app-footer">
            <p>認証機能はありません。storyIdを含むURLを知っている人は誰でも閲覧・承認できます。共有範囲に注意してください。</p>
          </footer>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
