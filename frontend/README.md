# novel-generator frontend

短編小説生成ワークフロー（`../`）用のReactフロントエンド。Vite + React + TypeScript、
React Router、TanStack Query（適応ポーリング）を使う。CloudFront + S3の静的ホスティングで配信する
ことを前提としており、リポジトリ全体のCDKスタックとは独立したnpmパッケージとして管理する。

## ローカル開発

```bash
npm ci
cp public/config.example.json public/config.json
# public/config.json の apiBaseUrl を、デプロイ済みのHTTP APIエンドポイントに書き換える

npm run dev
```

`public/config.json` はgit管理外（`.gitignore`）。デプロイ時にCDKの`NovelFrontend`コンストラクトが
実際のAPIエンドポイントで上書きするため、本番ビルドにAPIのURLを埋め込む必要はない。

## スクリプト

- `npm run dev` — 開発サーバー起動
- `npm run build` — 型チェック + 本番ビルド（`dist/`に出力。CDKの`NovelFrontend`がこれを配信する）
- `npm run test` — Vitestでユニットテストを実行
- `npm run lint` — oxlintで静的解析
- `npm run preview` — ビルド結果をローカルで確認

## 構成

```
src/
  api/            fetchクライアント・DTO型・ランタイム設定(config.json)読み込み
  hooks/          React Queryによる状態ポーリング、ローカル履歴(localStorage)
  components/     状態表示・承認フォーム・章一覧などのUIパーツ
  pages/          投稿ページ / ステータス確認ページ
```

## 認証について

このアプリには認証機構がない。`storyId`を含むURLを知っている人は誰でも該当の物語を閲覧・承認できる
（バックエンドの設計上の前提）。共有時はURLの取り扱いに注意すること。
