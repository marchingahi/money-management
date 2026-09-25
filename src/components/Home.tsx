import { useState } from 'react'
import { outflows, summarize, type IncomeStatus } from '../lib/budget'
import { cycleOf, formatMD, fromYMD, shiftCycle, todayYMD } from '../lib/dates'
import { FIXED_CATEGORY, type Transaction } from '../lib/types'
import { dayLabel, yen, type AppData } from '../useData'
import { CashflowCard } from './CashflowCard'
import { IncomeForm } from './IncomeForm'

interface Props {
  data: AppData
  onEntry: (initial?: Partial<Transaction>) => void
}

export function Home({ data, onEntry }: Props) {
  const { settings, members, incomes, methods, fixedCosts, transactions } = data
  const [editingIncome, setEditingIncome] = useState<IncomeStatus | null>(null)
  const today = todayYMD()
  const cycle = cycleOf(today, settings.cycleStartDay)
  const s = summarize(cycle, today, members, incomes, fixedCosts, transactions, settings)
  const cycles = [0, 1, 2].map((n) => shiftCycle(cycle, n, settings.cycleStartDay))
  const flows = outflows(today, methods, transactions, fixedCosts, cycles)
  // 口座残高の入力日が今のサイクルより前なら、そこから今のサイクルの手前まで（最大6回分）も繰越の計算に使う
  const leadCycles: typeof cycles = []
  if (settings.balanceDate && settings.balanceDate < cycle.start) {
    for (let n = -1; n >= -6 && shiftCycle(cycle, n + 1, settings.cycleStartDay).start > settings.balanceDate; n--) {
      leadCycles.unshift(shiftCycle(cycle, n, settings.cycleStartDay))
    }
  }
  const billings = flows.filter((o) => o.method.kind === 'credit' && o.paymentDate >= today)
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name
  const methodName = (id: string) => methods.find((m) => m.id === id)?.name ?? '（削除済み）'
  const usedRatio = s.budget > 0 ? Math.min(s.spent / s.budget, 1) : 1
  const needsSetup = s.income === 0

  const billingsByMonth = new Map<string, typeof billings>()
  for (const b of billings) {
    const d = fromYMD(b.paymentDate)
    const key = `${d.getFullYear()}年${d.getMonth() + 1}月`
    billingsByMonth.set(key, [...(billingsByMonth.get(key) ?? []), b])
  }

  return (
    <div className="home">
      {!needsSetup && <CashflowCard data={data} cycles={cycles} leadCycles={leadCycles} flows={flows} />}
      <section className="card hero">
        <p className="muted">
          {formatMD(cycle.start)} 〜 {formatMD(cycle.end)} のサイクル
        </p>
        {needsSetup ? (
          <p className="setup-note">「設定」で手取りの見込み額を入力すると、使える金額が表示されます。</p>
        ) : (
          <>
            <p className="hero-label">今サイクルの予算（使った日で計算） あと使える額</p>
            <p className={`hero-amount ${s.remaining < 0 ? 'neg' : ''}`}>{yen(s.remaining)}</p>
            {s.perDay != null && (
              <p className="hero-sub">
                1日あたり <strong>{yen(s.perDay)}</strong>（残り{s.daysLeft}日）
              </p>
            )}
            <div className="bar" aria-label={`予算の${Math.round(usedRatio * 100)}%を使用`}>
              <div className={`bar-fill ${s.remaining < 0 ? 'neg' : ''}`} style={{ width: `${usedRatio * 100}%` }} />
            </div>
            <dl className="breakdown">
              <div>
                <dt>世帯の手取り</dt>
                <dd>{yen(s.income)}</dd>
              </div>
              {s.incomes.map((i) => (
                <div key={i.member.id} className="sub">
                  <dt>
                    {i.member.name}（{dayLabel(i.member.payday)}）
                    <span className={`badge ${i.actual != null ? 'ok' : 'est'}`}>
                      {i.actual != null ? '実額' : '見込み'}
                    </span>
                  </dt>
                  <dd>
                    <button className="link-btn" onClick={() => setEditingIncome(i)}>
                      {yen(i.amount)} ✎
                    </button>
                  </dd>
                </div>
              ))}
              <div>
                <dt>固定費</dt>
                <dd>−{yen(s.fixedTotal)}</dd>
              </div>
              <div>
                <dt>先取り貯金</dt>
                <dd>−{yen(s.savings)}</dd>
              </div>
              <div>
                <dt>使った額</dt>
                <dd>−{yen(s.spent)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>

      <section className="card">
        <h2>今後の引落予定</h2>
        {billings.length === 0 && <p className="muted">引落予定はありません</p>}
        {[...billingsByMonth].map(([month, list]) => (
          <div key={month} className="billing-month">
            <div className="billing-month-head">
              <span>{month}</span>
              <span>{yen(list.reduce((t, b) => t + b.amount, 0))}</span>
            </div>
            <ul className="list">
              {list.map((b) => (
                <li key={`${b.method.id}-${b.paymentDate}`}>
                  <span className="date">{formatMD(b.paymentDate)}</span>
                  <span className="grow">
                    {b.method.name}
                    {b.method.ownerId != null && <span className="owner">{memberName(b.method.ownerId)}</span>}
                    <span className={`badge ${b.confirmed ? 'ok' : ''}`}>
                      {b.confirmed ? '確定' : `${formatMD(b.closingDate)}締め`}
                    </span>
                    {b.includesEstimate && <span className="badge est">見込み含む</span>}
                  </span>
                  <span className="amount">{yen(b.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {(s.fixed.length > 0 || s.otherFixed.length > 0) && (
        <section className="card">
          <h2>今サイクルの固定費</h2>
          <ul className="list">
            {s.otherFixed.map((t) => (
              <li key={`tx-${t.id}`} className="clickable" onClick={() => onEntry(t)}>
                <span className="date">{formatMD(t.date)}</span>
                <span className="grow">
                  {t.memo || FIXED_CATEGORY}
                  <span className="muted small"> {methodName(t.methodId)}</span>
                </span>
                <span className="amount">{yen(t.amount)}</span>
              </li>
            ))}
            {s.fixed.map((f) => (
              <li key={f.cost.id}>
                <span className="date">{formatMD(f.date)}</span>
                <span className="grow">
                  {f.cost.name}
                  <span className="muted small"> {methodName(f.cost.methodId)}</span>
                </span>
                {f.actual != null ? (
                  <span className="amount">{yen(f.actual)}</span>
                ) : (
                  <button
                    className="link-btn"
                    onClick={() =>
                      onEntry({
                        fixedCostId: f.cost.id,
                        methodId: f.cost.methodId,
                        category: FIXED_CATEGORY,
                        memo: f.cost.name,
                        amount: f.cost.amount,
                        date: f.date <= today ? f.date : today,
                      })
                    }
                  >
                    見込み {yen(f.cost.amount)}・実額入力
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {editingIncome && <IncomeForm status={editingIncome} cycle={cycle} onClose={() => setEditingIncome(null)} />}
    </div>
  )
}
