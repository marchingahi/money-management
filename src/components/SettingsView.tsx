import { useState, type ChangeEvent } from 'react'
import { db, exportBackup, importBackup, type Backup } from '../db'
import { todayYMD } from '../lib/dates'
import { KIND_LABEL, type MethodKind } from '../lib/types'
import { dayLabel, type AppData } from '../useData'

/** 入力中は文字列のまま保持し、フォーカスが外れたときに確定する数値入力 */
function NumInput({ value, onCommit, min = 0 }: { value: number; onCommit: (v: number) => void; min?: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      inputMode="numeric"
      value={draft ?? value.toLocaleString('ja-JP')}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => {
        const v = Math.max(Number(draft || 0), min)
        if (v !== value) onCommit(v)
        setDraft(null)
      }}
    />
  )
}

function TextInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null && draft.trim() && draft !== value) onCommit(draft.trim())
        setDraft(null)
      }}
    />
  )
}

function DaySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <option key={d} value={d}>
          {dayLabel(d)}
        </option>
      ))}
    </select>
  )
}

export function SettingsView({ data }: { data: AppData }) {
  const { settings, members, methods, fixedCosts, transactions } = data
  const [message, setMessage] = useState('')

  const deleteMethod = async (id: number) => {
    const used =
      transactions.some((t) => t.methodId === id) || fixedCosts.some((f) => f.methodId === id)
    if (used) {
      alert('この支払い方法を使っている支出や固定費があるため削除できません')
      return
    }
    if (confirm('この支払い方法を削除しますか？')) await db.methods.delete(id)
  }

  const deleteFixed = async (id: number) => {
    if (!confirm('この固定費を削除しますか？（入力済みの実額は残ります）')) return
    await db.transaction('rw', db.fixedCosts, db.transactions, async () => {
      await db.fixedCosts.delete(id)
      await db.transactions.where('fixedCostId').equals(id).modify((t) => {
        delete t.fixedCostId
      })
    })
  }

  const download = async () => {
    const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `money-backup-${todayYMD()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !confirm('現在のデータをすべて置き換えます。よろしいですか？')) return
    try {
      await importBackup(JSON.parse(await file.text()) as Backup)
      setMessage('復元しました')
    } catch (err) {
      setMessage(`復元に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="settings">
      <section className="card">
        <h2>家計</h2>
        <div className="form-grid">
          <label>
            サイクル開始日（給料日）
            <DaySelect
              value={settings.cycleStartDay}
              onChange={(v) => db.settings.update('main', { cycleStartDay: v })}
            />
          </label>
          <label>
            先取り貯金（月額）
            <NumInput value={settings.savings} onCommit={(v) => db.settings.update('main', { savings: v })} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>収入（手取り）</h2>
        {members.map((m) => (
          <div key={m.id} className="item">
            <div className="form-grid">
              <label>
                名前
                <TextInput value={m.name} onCommit={(v) => db.members.update(m.id!, { name: v })} />
              </label>
              <label>
                給料日
                <DaySelect value={m.payday} onChange={(v) => db.members.update(m.id!, { payday: v })} />
              </label>
              <label>
                手取り月額
                <NumInput value={m.takeHome} onCommit={(v) => db.members.update(m.id!, { takeHome: v })} />
              </label>
            </div>
            {members.length > 1 && (
              <button
                className="link-btn danger"
                onClick={() => confirm(`${m.name}を削除しますか？`) && db.members.delete(m.id!)}
              >
                削除
              </button>
            )}
          </div>
        ))}
        <button className="btn" onClick={() => db.members.add({ name: '新しい人', payday: 25, takeHome: 0 })}>
          ＋ 人を追加
        </button>
      </section>

      <section className="card">
        <h2>支払い方法</h2>
        <p className="muted small">締め日・支払日の「末日」は月の最終日として扱います。支払日が休業日なら翌営業日で計算します。</p>
        {methods.map((m) => (
          <div key={m.id} className="item">
            <div className="form-grid">
              <label>
                名前
                <TextInput value={m.name} onCommit={(v) => db.methods.update(m.id!, { name: v })} />
              </label>
              <label>
                種類
                <select
                  value={m.kind}
                  onChange={(e) => db.methods.update(m.id!, { kind: e.target.value as MethodKind })}
                >
                  {Object.entries(KIND_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                名義
                <select
                  value={m.ownerId ?? ''}
                  onChange={(e) =>
                    db.methods.update(m.id!, { ownerId: e.target.value ? Number(e.target.value) : undefined })
                  }
                >
                  <option value="">共通</option>
                  {members.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {m.kind === 'credit' && (
                <>
                  <label>
                    締め日
                    <DaySelect value={m.closingDay} onChange={(v) => db.methods.update(m.id!, { closingDay: v })} />
                  </label>
                  <label>
                    支払月
                    <select
                      value={m.monthOffset}
                      onChange={(e) => db.methods.update(m.id!, { monthOffset: Number(e.target.value) })}
                    >
                      <option value={1}>翌月</option>
                      <option value={2}>翌々月</option>
                    </select>
                  </label>
                  <label>
                    支払日
                    <DaySelect value={m.paymentDay} onChange={(v) => db.methods.update(m.id!, { paymentDay: v })} />
                  </label>
                </>
              )}
            </div>
            <button className="link-btn danger" onClick={() => deleteMethod(m.id!)}>
              削除
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            db.methods.add({
              name: '新しいカード',
              kind: 'credit',
              closingDay: 31,
              paymentDay: 27,
              monthOffset: 1,
              order: Math.max(0, ...methods.map((m) => m.order)) + 1,
            })
          }
        >
          ＋ 支払い方法を追加
        </button>
      </section>

      <section className="card">
        <h2>固定費</h2>
        <p className="muted small">
          光熱費など毎月金額が変わるものは見込み額を入れておき、請求が来たらホーム画面から実額を入力してください。
        </p>
        {fixedCosts.map((f) => (
          <div key={f.id} className="item">
            <div className="form-grid">
              <label>
                名前
                <TextInput value={f.name} onCommit={(v) => db.fixedCosts.update(f.id!, { name: v })} />
              </label>
              <label>
                見込み額
                <NumInput value={f.amount} onCommit={(v) => db.fixedCosts.update(f.id!, { amount: v })} />
              </label>
              <label>
                毎月の利用日
                <DaySelect value={f.day} onChange={(v) => db.fixedCosts.update(f.id!, { day: v })} />
              </label>
              <label>
                支払い方法
                <select
                  value={f.methodId}
                  onChange={(e) => db.fixedCosts.update(f.id!, { methodId: Number(e.target.value) })}
                >
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="link-btn danger" onClick={() => deleteFixed(f.id!)}>
              削除
            </button>
          </div>
        ))}
        <button
          className="btn"
          disabled={methods.length === 0}
          onClick={() => db.fixedCosts.add({ name: '新しい固定費', amount: 0, day: 1, methodId: methods[0].id! })}
        >
          ＋ 固定費を追加
        </button>
      </section>

      <section className="card">
        <h2>データ</h2>
        <p className="muted small">
          データはこの端末のブラウザ内にだけ保存されています。機種変更やPCへの移行、万一に備えて定期的にバックアップしてください。
        </p>
        <div className="btn-row">
          <button className="btn" onClick={download}>
            バックアップを保存
          </button>
          <label className="btn">
            バックアップから復元
            <input type="file" accept="application/json" hidden onChange={upload} />
          </label>
        </div>
        {message && <p className="hint">{message}</p>}
      </section>
    </div>
  )
}
