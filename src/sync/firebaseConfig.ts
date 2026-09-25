import type { FirebaseOptions } from 'firebase/app'

/**
 * Firebase コンソールの「プロジェクトの設定 → マイアプリ」に表示される設定値（JSON）。
 * リポジトリには含めず、ビルド時に環境変数 VITE_FIREBASE_CONFIG から読み込む。
 * - GitHub Pages: リポジトリ変数 FIREBASE_CONFIG（deploy.yml で受け渡す）
 * - ローカル開発: .env.local に VITE_FIREBASE_CONFIG={...} と書く
 * 設定がない間は同期機能を使わない。
 */
function load(): FirebaseOptions | null {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined
  if (!raw) return null
  try {
    const config = JSON.parse(raw) as FirebaseOptions
    return config.apiKey && config.projectId ? config : null
  } catch (e) {
    console.error('VITE_FIREBASE_CONFIG を読み取れません', e)
    return null
  }
}

export const firebaseConfig = load()
