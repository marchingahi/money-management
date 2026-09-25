import { useState } from 'react'
import { loadSync, syncConfigured } from '../sync'
import { useSyncStatus, type SyncStatus } from '../sync/status'

const time = (ms: number) => new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

function describe(s: SyncStatus): string {
  switch (s.state) {
    case 'synced':
      return s.pending ? `未送信 ${s.pending}件` : `同期済み（${time(s.lastSync!)}）`
    case 'syncing':
      return '同期中…'
    case 'offline':
      return `オフライン（未送信 ${s.pending}件。つながったら送信します）`
    case 'error':
      return `エラー: ${s.error}`
    default:
      return ''
  }
}

/** 設定画面の「同期」欄: ログインと同期状態の表示 */
export function SyncSection() {
  const status = useSyncStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: (e: Awaited<ReturnType<typeof loadSync>> & object) => Promise<unknown>, done = '') => {
    setBusy(true)
    setMessage('')
    try {
      await fn((await loadSync())!)
      setMessage(done)
      setPassword('')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!syncConfigured) {
    return (
      <section className="card">
        <h2>スマホ・PCの同期</h2>
        <p className="muted small">同期はまだ設定されていません。データはこの端末の中にだけ保存されています。</p>
      </section>
    )
  }

  const signedIn = status.state !== 'signedOut' && status.state !== 'unconfigured'

  return (
    <section className="card">
      <h2>スマホ・PCの同期</h2>
      {signedIn ? (
        <>
          <p className="small">
            <strong>{status.email}</strong> でログイン中
          </p>
          <p className={`sync-state ${status.state}`}>{describe(status)}</p>
          <p className="muted small">
            変更はこの端末に保存したうえで自動で送信され、同じアカウントでログインしている他の端末に反映されます。
          </p>
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={() => run((s) => s.signOut())}>
              ログアウト
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">
            同じアカウントでスマホとPCの両方にログインすると、データが自動で同期されます。この端末のデータもアカウントに送信されます。
          </p>
          <div className="form-grid sync-form">
            <label>
              メールアドレス
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              パスワード（6文字以上）
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <div className="btn-row">
            <button
              className="btn primary"
              disabled={busy || !email || !password}
              onClick={() => run((s) => s.signIn(email, password))}
            >
              ログイン
            </button>
            <button
              className="btn"
              disabled={busy || !email || password.length < 6}
              onClick={() => run((s) => s.signUp(email, password))}
            >
              新規登録
            </button>
            <button
              className="btn"
              disabled={busy || !email}
              onClick={() => run((s) => s.resetPassword(email), 'パスワード再設定のメールを送りました')}
            >
              パスワードを忘れた
            </button>
          </div>
        </>
      )}
      {message && <p className="hint">{message}</p>}
    </section>
  )
}
