import { useState } from 'react'
import { billingOf } from '../lib/billing'
import { inCycle } from '../lib/budget'
import { cycleOf, formatMD, shiftCycle, todayYMD } from '../lib/dates'
import type { Transaction } from '../lib/types'
import { yen, type AppData } from '../useData'

interface Props {
  data: AppData
  onEdit: (tx: Transaction) => void
}

export function History({ data, onEdit }: Props) {
  const { settings, methods, transactions } = data
  const [offset, setOffset] = useState(0)
  const cycle = shiftCycle(cycleOf(todayYMD(), settings.cycleStartDay), offset, settings.cycleStartDay)
  const txs = transactions.filter((t) => inCycle(t.date, cycle))
  const total = txs.reduce((s, t) => s + t.amount, 0)

  const byCategory = new Map<string, number>()
  for (const t of txs) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount)
  const categories = [...byCategory].sort((a, b) => b[1] - a[1])

  const byDate = new Map<string, Transaction[]>()
  for (const t of txs) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t])

  return (
    <div className="history">
      <div className="cycle-nav card">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="前のサイクル">
          ‹
        </button>
        <div>
          <strong>
            {formatMD(cycle.start)} 〜 {formatMD(cycle.end)}
          </strong>
          <p className="muted small">合計 {yen(total)}（固定費含む）</p>
        </div>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="次のサイクル">
          ›
        </button>
      </div>

      {categories.length > 0 && (
        <section className="card">
          <h2>カテゴリ別</h2>
          <ul className="cat-list">
            {categories.map(([c, v]) => (
              <li key={c}>
                <span className="cat-name">{c}</span>
                <span className="cat-bar">
                  <span style={{ width: `${(v / categories[0][1]) * 100}%` }} />
                </span>
                <span className="amount">{yen(v)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>明細</h2>
        {txs.length === 0 && <p className="muted">このサイクルの支出はまだありません</p>}
        {[...byDate].map(([date, list]) => (
          <div key={date}>
            <p className="date-head">{formatMD(date)}</p>
            <ul className="list">
              {list.map((t) => {
                const method = methods.find((m) => m.id === t.methodId)
                const billing = method?.kind === 'credit' ? billingOf(t.date, method, t.paymentMonth) : undefined
                return (
                  <li key={t.id} className="clickable" onClick={() => onEdit(t)}>
                    <span className="grow">
                      <span>{t.memo || t.category}</span>
                      <span className="muted small">
                        {t.memo ? `${t.category}・` : ''}
                        {method?.name ?? '（削除済み）'}
                        {billing && ` → ${formatMD(billing.paymentDate)}引落`}
                      </span>
                    </span>
                    <span className="amount">{yen(t.amount)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}
