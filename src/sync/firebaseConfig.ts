import type { FirebaseOptions } from 'firebase/app'

/**
 * Firebase コンソールの「プロジェクトの設定 → マイアプリ」に表示される設定値。
 * Web アプリの設定値は公開される前提のもので、秘密情報ではない
 * （データへのアクセスは Firebase Authentication と Firestore のルールで制限する）。
 * null の間は同期機能を使わない。
 */
export const firebaseConfig: FirebaseOptions | null = null
