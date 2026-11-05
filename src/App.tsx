import { useMemo, useState } from 'react'
import { setDemo, useDemo } from './demoMode'
import { buildDemoData } from './lib/demo'
import { todayYMD } from './lib/dates'
import { EntryForm } from './components/EntryForm'
import { History } from './components/History'
import { Home } from './components/Home'
import { SettingsView } from './components/SettingsView'
import type { Transaction } from './lib/types'
import { useData } from './useData'

type Tab = 'home' | 'history' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'ホーム', icon: '◎' },
  { id: 'history', label: '履歴', icon: '☰' },
  { id: 'settings', label: '設定', icon: '⚙' },
]

export default function App() {
  const realData = useData()
  const demo = useDemo()
  // デモ表示中は、実際のデータを使わず、架空のサンプルデータを表示する
  const data = useMemo(() => (demo ? buildDemoData(todayYMD()) : realData), [demo, realData])
  const [tab, setTab] = useState<Tab>('home')
  const [entry, setEntry] = useState<Partial<Transaction> | null>(null)

  if (!data) return <div className="loading">読み込み中…</div>

  return (
    <div className="app">
      <header className="app-header">
        <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
        <button
          type="button"
          className={`demo-btn ${demo ? 'on' : ''}`}
          aria-pressed={demo}
          onClick={() => setDemo(!demo)}
          title="実際のデータの代わりに、架空のサンプルデータを表示します（人に見せるとき用）"
        >
          {demo ? 'デモ表示中 ✕' : 'デモ表示'}
        </button>
      </header>
      {demo && (
        <p className="demo-banner">サンプルデータを表示しています。実際のデータは表示も変更もされません。</p>
      )}

      <main className="app-main">
        {tab === 'home' && <Home data={data} onEntry={(initial) => setEntry(initial ?? {})} />}
        {tab === 'history' && <History data={data} onEdit={setEntry} />}
        {tab === 'settings' && <SettingsView data={data} />}
      </main>

      {tab !== 'settings' && (
        <button className="fab" onClick={() => setEntry({})} aria-label="支出を入力">
          ＋
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {entry && <EntryForm key={entry.id ?? 'new'} data={data} initial={entry} onClose={() => setEntry(null)} />}
    </div>
  )
}
