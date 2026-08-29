import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { loadRuntimeConfig } from './api/runtimeConfig.ts';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root element not found');
}
const root = createRoot(rootElement);

loadRuntimeConfig()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error('起動設定の読み込みに失敗しました', error);
    root.render(
      <StrictMode>
        <div className="boot-error">
          <h1>起動に失敗しました</h1>
          <p>
            <code>/config.json</code> を読み込めませんでした。デプロイ環境ではCDKの
            <code>NovelFrontend</code>コンストラクトが自動生成しますが、ローカル開発では
            <code>frontend/public/config.example.json</code>を<code>frontend/public/config.json</code>
            としてコピーし、<code>apiBaseUrl</code>を実際のAPIエンドポイントに設定してください。
          </p>
          <pre>{error instanceof Error ? error.message : String(error)}</pre>
        </div>
      </StrictMode>,
    );
  });
