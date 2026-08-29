/**
 * デプロイ後に確定するAPIエンドポイントなどを、ビルド物とは独立にランタイムで読み込む。
 *
 * `public/config.json` はCDKの`BucketDeployment`が本番デプロイ時に実際の値で
 * 上書きするため、フロントエンドのビルド物自体はインフラのURLに依存しない
 * （インフラだけを更新してもフロントの再ビルドが不要になる）。
 * ローカル開発では `public/config.example.json` をコピーして使う想定で、
 * `config.json` はgitで管理しない。
 */
export interface RuntimeConfig {
  /** バックエンドHTTP APIのベースURL（末尾にスラッシュを含めない）。 */
  apiBaseUrl: string;
}

let cachedConfig: Promise<RuntimeConfig> | undefined;
let loadedConfig: RuntimeConfig | undefined;

function normalize(raw: unknown): RuntimeConfig {
  if (
    !raw ||
    typeof raw !== 'object' ||
    typeof (raw as Record<string, unknown>).apiBaseUrl !== 'string' ||
    (raw as Record<string, unknown>).apiBaseUrl === ''
  ) {
    throw new Error('config.json に文字列の apiBaseUrl が見つかりません');
  }
  const apiBaseUrl = (raw as Record<string, unknown>).apiBaseUrl as string;
  return { apiBaseUrl: apiBaseUrl.replace(/\/+$/, '') };
}

/** アプリ起動時に一度だけ呼ぶ。以後は `getRuntimeConfig()` で同期的に取得する。 */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (!cachedConfig) {
    cachedConfig = fetch('/config.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`config.json の取得に失敗しました (status: ${response.status})`);
        }
        return response.json();
      })
      .then((raw) => {
        const config = normalize(raw);
        loadedConfig = config;
        return config;
      })
      .catch((error: unknown) => {
        cachedConfig = undefined;
        throw error;
      });
  }
  return cachedConfig;
}

/** `loadRuntimeConfig()` 完了後にのみ呼べる。未読み込みなら例外を投げる。 */
export function getRuntimeConfig(): RuntimeConfig {
  if (!loadedConfig) {
    throw new Error('RuntimeConfig is not loaded yet. Call loadRuntimeConfig() first.');
  }
  return loadedConfig;
}
