import { useState, type ChangeEvent } from 'react'
import { backupToDataSet, exportBackup } from '../db'
import { newMember } from '../lib/seed'
import { repo } from '../repo'
import { expectedTakeHome } from '../lib/budget'
import { todayYMD } from '../lib/dates'
import { KIND_LABEL, type MethodKind, type PayType } from '../lib/types'
import { dayLabel, yen, type AppData } from '../useData'
import { ImportSheet } from './ImportSheet'
import { SyncSection } from './SyncSection'

/*
 * 入力のたびに即保存する。フォーカスが外れたときに保存する方式だと、iPhone で
 * 入力中にタブを切り替えた場合に blur が発生せず、値が失われる。
 * 入力中の文字列（空欄や小数点の途中など）は draft として画面側だけで保持する。
 */
function NumInput({
  value,
  onCommit,
  decimal = false,
}: {
  value: number
  onCommit: (v: number) => void
  decimal?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={draft ?? value.toLocaleString('ja-JP')}
      onFocus={() => setDraft(value ? String(value) : '')}
      onChange={(e) => {
        const text = decimal ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/[^\d]/g, '')
        setDraft(text)
        const v = Number(text || 0)
        if (Number.isFinite(v) && v !== value) onCommit(v)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

function TextInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.target.value.trim()) onCommit(e.target.value.trim())
      }}
      onBlur={() => setDraft(null)}
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
  const [importing, setImporting] = useState(false)

  const deleteMethod = async (id: string) => {
    const used =
      transactions.some((t) => t.methodId === id) || fixedCosts.some((f) => f.methodId === id)
    if (used) {
      alert('この支払い方法を使っている支出や固定費があるため削除できません')
      return
    }
    if (confirm('この支払い方法を削除しますか？')) await repo.remove('methods', id)
  }

  const deleteFixed = async (id: string) => {
    if (!confirm('この固定費を削除しますか？（入力済みの実額は残ります）')) return
    await repo.remove('fixedCosts', id)
    // 入力済みの実額は「固定費」カテゴリの支出として残す
    for (const t of transactions.filter((t) => t.fixedCostId === id)) {
      await repo.update('transactions', t.id, { fixedCostId: undefined })
    }
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
      await repo.replaceAll(backupToDataSet(JSON.parse(await file.text())))
      setMessage('復元しました')
    } catch (err) {
      setMessage(`復元に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="settings">
      <SyncSection />
      <section className="card">
        <h2>家計</h2>
        <div className="form-grid">
          <label>
            サイクル開始日（給料日）
            <DaySelect
              value={settings.cycleStartDay}
              onChange={(v) => repo.update('settings', 'main', { cycleStartDay: v })}
            />
          </label>
          <label>
            先取り貯金（月額）
            <NumInput value={settings.savings} onCommit={(v) => repo.update('settings', 'main', { savings: v })} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>収入（手取りの見込み）</h2>
        <p className="muted small">
          ここで設定した見込み額で予算を計算します。給与明細や振込額が分かったら、ホーム画面の金額をタップして実額を入力してください。変動がある場合は少し低めに設定しておくと安全です。
        </p>
        {members.map((m) => (
          <div key={m.id} className="item">
            <div className="form-grid">
              <label>
                名前
                <TextInput value={m.name} onCommit={(v) => repo.update('members', m.id, { name: v })} />
              </label>
              <label>
                給料日
                <DaySelect value={m.payday} onChange={(v) => repo.update('members', m.id, { payday: v })} />
              </label>
              <label>
                給与形態
                <select
                  value={m.payType}
                  onChange={(e) => repo.update('members', m.id, { payType: e.target.value as PayType })}
                >
                  <option value="monthly">月給</option>
                  <option value="hourly">時給</option>
                </select>
              </label>
              {m.payType === 'monthly' ? (
                <label>
                  手取り見込み（月額）
                  <NumInput value={m.takeHome} onCommit={(v) => repo.update('members', m.id, { takeHome: v })} />
                </label>
              ) : (
                <>
                  <label>
                    時給
                    <NumInput value={m.hourlyWage} onCommit={(v) => repo.update('members', m.id, { hourlyWage: v })} />
                  </label>
                  <label>
                    1日の勤務時間
                    <NumInput
                      decimal
                      value={m.hoursPerDay}
                      onCommit={(v) => repo.update('members', m.id, { hoursPerDay: v })}
                    />
                  </label>
                  <label>
                    月の勤務日数
                    <NumInput
                      value={m.daysPerMonth}
                      onCommit={(v) => repo.update('members', m.id, { daysPerMonth: v })}
                    />
                  </label>
                  <label>
                    控除率（%）
                    <NumInput
                      decimal
                      value={m.deductionRate}
                      onCommit={(v) => repo.update('members', m.id, { deductionRate: Math.min(v, 100) })}
                    />
                  </label>
                </>
              )}
            </div>
            {m.payType === 'hourly' && (
              <p className="hint">
                見込み手取り {yen(expectedTakeHome(m))}（{m.hourlyWage.toLocaleString('ja-JP')}円 × {m.hoursPerDay}時間 ×{' '}
                {m.daysPerMonth}日 − 控除{m.deductionRate}%）
              </p>
            )}
            {members.length > 1 && (
              <button
                className="link-btn danger"
                onClick={() => confirm(`${m.name}を削除しますか？`) && repo.remove('members', m.id)}
              >
                削除
              </button>
            )}
          </div>
        ))}
        <button className="btn" onClick={() => repo.add('members', newMember('新しい人'))}>
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
                <TextInput value={m.name} onCommit={(v) => repo.update('methods', m.id, { name: v })} />
              </label>
              <label>
                種類
                <select
                  value={m.kind}
                  onChange={(e) => repo.update('methods', m.id, { kind: e.target.value as MethodKind })}
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
                    repo.update('methods', m.id, { ownerId: e.target.value || undefined })
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
                    <DaySelect value={m.closingDay} onChange={(v) => repo.update('methods', m.id, { closingDay: v })} />
                  </label>
                  <label>
                    支払月
                    <select
                      value={m.monthOffset}
                      onChange={(e) => repo.update('methods', m.id, { monthOffset: Number(e.target.value) })}
                    >
                      <option value={1}>翌月</option>
                      <option value={2}>翌々月</option>
                    </select>
                  </label>
                  <label>
                    支払日
                    <DaySelect value={m.paymentDay} onChange={(v) => repo.update('methods', m.id, { paymentDay: v })} />
                  </label>
                </>
              )}
            </div>
            <button className="link-btn danger" onClick={() => deleteMethod(m.id)}>
              削除
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            repo.add('methods', {
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
                <TextInput value={f.name} onCommit={(v) => repo.update('fixedCosts', f.id, { name: v })} />
              </label>
              <label>
                見込み額
                <NumInput value={f.amount} onCommit={(v) => repo.update('fixedCosts', f.id, { amount: v })} />
              </label>
              <label>
                毎月の利用日
                <DaySelect value={f.day} onChange={(v) => repo.update('fixedCosts', f.id, { day: v })} />
              </label>
              <label>
                支払い方法
                <select
                  value={f.methodId}
                  onChange={(e) => repo.update('fixedCosts', f.id, { methodId: e.target.value })}
                >
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="link-btn danger" onClick={() => deleteFixed(f.id)}>
              削除
            </button>
          </div>
        ))}
        <button
          className="btn"
          disabled={methods.length === 0}
          onClick={() => repo.add('fixedCosts', { name: '新しい固定費', amount: 0, day: 1, methodId: methods[0].id })}
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
          <button className="btn" onClick={() => setImporting(true)}>
            Excelから取り込み
          </button>
        </div>
        {message && <p className="hint">{message}</p>}
      </section>
      {importing && <ImportSheet data={data} onClose={() => setImporting(false)} />}
    </div>
  )
}
