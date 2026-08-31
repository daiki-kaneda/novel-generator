# novel-generator frontend

短編小説生成ワークフロー（`../`）用のReactフロントエンド。Vite + React + TypeScript、
React Router、TanStack Query（適応ポーリング）を使う。CloudFront + S3の静的ホスティングで配信する
ことを前提としており、リポジトリ全体のCDKスタックとは独立したnpmパッケージとして管理する。

## 前提

Node.js **20.18+** が必要です。リポジトリ直下の `.nvmrc` は Node 20 系を指定しています。

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
  api/            fetchクライアント・DTO型・ランタイム設定(config.json)読み込み・認証トークン注入
  auth/           Cognitoクライアント(amazon-cognito-identity-js)ラッパーとAuthContext
  hooks/          React Queryによる状態ポーリング
  components/     状態表示・承認フォーム・章一覧・ProtectedRouteなどのUIパーツ
  pages/          投稿ページ / ログイン・サインアップ・確認コード / マイストーリー / ステータス確認ページ / 章本文リーダー
```

## 認証について

Cognito User Pool を使ったメール＋パスワードのセルフサインアップ認証を必須にしている。
`AuthContext`（`src/auth/AuthContext.tsx`）がサインアップ・確認コード入力・サインイン・サインアウトの
状態を管理し、`src/auth/cognitoClient.ts`（`amazon-cognito-identity-js`のラッパー）経由でCognitoと通信する。
サインイン後に取得したIDトークンは`src/api/authToken.ts`を通じてAPIクライアント（`src/api/client.ts`）に
注入され、すべてのAPIリクエストに`Authorization: Bearer <idToken>`ヘッダーとして付与される。

`/`・`/me/stories`・`/stories/:storyId`などの主要ルートは`ProtectedRoute`でラップされており、
未ログインの場合は`/login`にリダイレクトされる（ログイン後に元のURLへ戻る）。
`storyId`を含むURLを知っていても、実際にその物語の所有者としてログインしていなければ閲覧・承認できない
（バックエンド側で`ownerId`による所有者チェックを行っている）。
