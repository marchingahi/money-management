import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db, tableOf, TABLES, type TableName } from '../db'
import { onLocalChange } from '../repo'
import { setStatus } from './status'

/*
 * 端末内のデータ（IndexedDB）を正とし、Firestore の kakeibo/{uid}/{テーブル}/{id} と同期する。
 * - 送信: 「未送信」の印が付いたレコードを送る
 * - 受信: 前回受信した時刻より後にサーバーで更新されたドキュメントだけを購読する（読み取り回数を抑える）
 * - 競合: 両方で変更があった場合は、変更時刻（_modifiedAt）が新しい方を採用する
 */

const BATCH_SIZE = 400
/** 既存の Firebase プロジェクトに同居しても他のアプリのデータと混ざらないよう、専用のコレクションに保存する */
const ROOT = 'kakeibo'

let auth: Auth
let fs: Firestore
let uid: string | null = null
let unsubs: Unsubscribe[] = []
/** 起動後、サーバーからの最初の受信が済んだテーブル。全テーブル揃うまでは送信しない */
const pulled = new Set<TableName>()
let pushing = false
let pushAgain = false
let timer: ReturnType<typeof setTimeout> | undefined

const pulledKey = (t: TableName) => `pulled:${uid}:${t}`

export function init(config: FirebaseOptions) {
  const app = initializeApp(config)
  auth = getAuth(app)
  fs = initializeFirestore(app, { ignoreUndefinedProperties: true })
  // 開発時の動作確認用: VITE_FIREBASE_EMULATOR=1 でローカルのエミュレーターにつなぐ
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATOR) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(fs, '127.0.0.1', 8080)
  }
  setStatus({ state: 'signedOut' })
  onAuthStateChanged(auth, (user) => (user ? start(user) : stop()))
  onLocalChange(() => schedulePush())
  window.addEventListener('online', () => schedulePush(0))
  window.addEventListener('offline', () => setStatus({ state: 'offline' }))
}

async function start(user: User) {
  stop()
  uid = user.uid
  setStatus({ state: 'syncing', email: user.email, error: undefined })
  await refreshPending()
  for (const t of TABLES) {
    const last = ((await db.meta.get(pulledKey(t)))?.value as number | undefined) ?? 0
    const q = query(collection(fs, ROOT, uid, t), where('updatedAt', '>', Timestamp.fromMillis(last)))
    unsubs.push(
      onSnapshot(
        q,
        (snap) => void applySnapshot(t, snap),
        (err) => setStatus({ state: 'error', error: err.message }),
      ),
    )
  }
}

function stop() {
  unsubs.forEach((u) => u())
  unsubs = []
  pulled.clear()
  uid = null
  setStatus({ state: 'signedOut', email: null })
}

async function applySnapshot(t: TableName, snap: QuerySnapshot) {
  const changes = snap
    .docChanges()
    .filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
  if (changes.length) {
    const key = pulledKey(t)
    await db.transaction('rw', tableOf(t), db.meta, async () => {
      let max = ((await db.meta.get(key))?.value as number | undefined) ?? 0
      for (const c of changes) {
        const { updatedAt, ...data } = c.doc.data()
        const serverTime = (updatedAt as Timestamp | null)?.toMillis() ?? 0
        max = Math.max(max, serverTime)
        const local = await tableOf(t).get(c.doc.id)
        // この端末に、受信した内容より新しい未送信の変更があればそちらを残す
        if (local?._dirty && (local._modifiedAt ?? 0) > ((data._modifiedAt as number | undefined) ?? 0)) continue
        await tableOf(t).put({ ...data, id: c.doc.id, updatedAt: serverTime, _dirty: 0 })
      }
      await db.meta.put({ key, value: max })
    })
  }
  // キャッシュからの結果ではなく、サーバーから受信できた時点で「受信済み」とする
  if (!snap.metadata.fromCache && !pulled.has(t)) {
    pulled.add(t)
    if (pulled.size === TABLES.length) schedulePush(0)
  }
}

function schedulePush(delay = 800) {
  clearTimeout(timer)
  timer = setTimeout(() => void push(), delay)
  void refreshPending()
}

async function refreshPending() {
  const counts = await Promise.all(TABLES.map((t) => tableOf(t).where('_dirty').equals(1).count()))
  setStatus({ pending: counts.reduce((a, b) => a + b, 0) })
}

async function push() {
  if (!uid || pulled.size < TABLES.length) return
  if (pushing) {
    pushAgain = true
    return
  }
  pushing = true
  const user = uid
  try {
    setStatus({ state: navigator.onLine ? 'syncing' : 'offline' })
    for (const t of TABLES) {
      const dirty = await tableOf(t).where('_dirty').equals(1).toArray()
      for (let i = 0; i < dirty.length; i += BATCH_SIZE) {
        const chunk = dirty.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(fs)
        for (const r of chunk) {
          const { _dirty: _d, updatedAt: _u, ...data } = r
          batch.set(doc(fs, ROOT, user, t, r.id), { ...data, updatedAt: serverTimestamp() })
        }
        await batch.commit()
        // 送信中に変更されていなければ「送信済み」にする
        await db.transaction('rw', tableOf(t), async () => {
          for (const r of chunk) {
            const cur = await tableOf(t).get(r.id)
            if (cur && cur._modifiedAt === r._modifiedAt) await tableOf(t).update(r.id, { _dirty: 0 })
          }
        })
      }
    }
    setStatus({ state: 'synced', lastSync: Date.now(), error: undefined })
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) })
  } finally {
    pushing = false
    await refreshPending()
    if (pushAgain) {
      pushAgain = false
      schedulePush(0)
    }
  }
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'メールアドレスかパスワードが違います',
  'auth/wrong-password': 'メールアドレスかパスワードが違います',
  'auth/user-not-found': 'メールアドレスかパスワードが違います',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません',
  'auth/email-already-in-use': 'このメールアドレスは登録済みです。ログインしてください',
  'auth/weak-password': 'パスワードは6文字以上にしてください',
  'auth/network-request-failed': 'ネットワークに接続できません',
  'auth/too-many-requests': '試行回数が多すぎます。しばらくしてからお試しください',
  'auth/operation-not-allowed': 'Firebase でメール/パスワードのログインが有効になっていません',
  'auth/admin-restricted-operation': '新規登録は無効になっています',
}

async function withMessage<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    throw new Error(AUTH_ERRORS[code] ?? (e instanceof Error ? e.message : String(e)), { cause: e })
  }
}

export const signIn = (email: string, password: string) =>
  withMessage(() => signInWithEmailAndPassword(auth, email, password))
export const signUp = (email: string, password: string) =>
  withMessage(() => createUserWithEmailAndPassword(auth, email, password))
export const resetPassword = (email: string) => withMessage(() => sendPasswordResetEmail(auth, email))
export const signOut = () => fbSignOut(auth)
