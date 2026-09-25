import { useState } from 'react'
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
  const data = useData()
  const [tab, setTab] = useState<Tab>('home')
  const [entry, setEntry] = useState<Partial<Transaction> | null>(null)

  if (!data) return <div className="loading">読み込み中…</div>

  return (
    <div className="app">
      <header className="app-header">
        <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
      </header>

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
