import { useState } from 'react'
import { accountOfOutflow, budgetIncomeCycle, inCycle, outflowKey, outflows, summarize, type IncomeStatus } from '../lib/budget'
import { cycleOf, cycleRule, formatMD, fromYMD, shiftCycle, todayYMD } from '../lib/dates'
import { FIXED_CATEGORY, type Transaction } from '../lib/types'
import { dayLabel, yen, type AppData } from '../useData'
import { CardTimingCard } from './CardTimingCard'
import { Collapsible } from './Collapsible'
import { useOpen } from './useOpen'
import { CashflowCard } from './CashflowCard'
import { PlannedCard } from './PlannedCard'
import { IncomeForm } from './IncomeForm'

interface Props {
  data: AppData
  onEntry: (initial?: Partial<Transaction>) => void
}

export function Home({ data, onEntry }: Props) {
  const { settings, members, incomes, methods, fixedCosts, transactions } = data
  const [showBreakdown, toggleBreakdown] = useOpen('hero-breakdown')
  const [editingIncome, setEditingIncome] = useState<IncomeStatus | null>(null)
  const today = todayYMD()
  const cycle = cycleOf(today, cycleRule(settings))
  const incomeCycle = budgetIncomeCycle(cycle, settings)
  const s = summarize(cycle, today, members, incomes, fixedCosts, transactions, settings, incomeCycle, data.planned, methods)
  const cycles = [0, 1, 2].map((n) => shiftCycle(cycle, n, cycleRule(settings)))
  const flows = outflows(today, methods, transactions, fixedCosts, cycles, data.planned)
  // 口座残高の入力日が今のサイクルより前なら、そこから今のサイクルの手前まで（最大6回分）も繰越の計算に使う
  const oldestBalance = data.accounts
    .flatMap((a) => (a.balance != null && a.balanceDate ? [a.balanceDate] : []))
    .sort()[0]
  const leadCycles: typeof cycles = []
  if (oldestBalance && oldestBalance < cycle.start) {
    for (let n = -1; n >= -6 && shiftCycle(cycle, n + 1, cycleRule(settings)).start > oldestBalance; n--) {
      leadCycles.unshift(shiftCycle(cycle, n, cycleRule(settings)))
    }
  }
  // 引落予定: クレジットの請求と、口座から引き落とされる現金払い・固定費（口座を使わない現金は除く）
  const billings = flows.filter(
    (o) => o.paymentDate >= today && (o.method.kind === 'credit' || accountOfOutflow(o, data.accounts) != null),
  )
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
            <button type="button" className="link-btn" onClick={toggleBreakdown} aria-expanded={showBreakdown}>
              {showBreakdown ? '内訳を隠す ▴' : '内訳を見る ▾'}
            </button>
            <dl className="breakdown" hidden={!showBreakdown}>
              <div>
                <dt>世帯の手取り（{formatMD(incomeCycle.start)}の給料）</dt>
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
              {s.plannedTotal !== 0 && (
                <div>
                  <dt>予定の出費の確保</dt>
                  <dd>
                    {s.plannedTotal > 0 ? '−' : '+'}
                    {yen(Math.abs(s.plannedTotal))}
                  </dd>
                </div>
              )}
              <div>
                <dt>使った額</dt>
                <dd>−{yen(s.spent)}</dd>
              </div>
              {s.committed.length > 0 && (
                <>
                  <div>
                    <dt>確定済みの引落（前の利用分）</dt>
                    <dd>−{yen(s.committedTotal)}</dd>
                  </div>
                  {s.committed.map((c) => (
                    <div key={`${c.method.id}-${c.paymentDate}`} className="sub">
                      <dt>
                        {c.method.name}（{formatMD(c.paymentDate)}引落）
                      </dt>
                      <dd>{yen(c.amount)}</dd>
                    </div>
                  ))}
                  <div className="total">
                    <dt>実質あと使える額</dt>
                    <dd className={s.realRemaining < 0 ? 'neg' : ''}>{yen(s.realRemaining)}</dd>
                  </div>
                </>
              )}
            </dl>
          </>
        )}
      </section>
      {!needsSetup && <CardTimingCard data={data} today={today} cycle={cycle} />}
      {!needsSetup && <CashflowCard data={data} cycles={cycles} leadCycles={leadCycles} flows={flows} />}
      <PlannedCard data={data} cycle={cycle} statuses={s.planned} total={s.plannedTotal} onPay={onEntry} />

      <Collapsible id="billings" title="今後の引落予定">
        {billings.length === 0 && <p className="muted">引落予定はありません</p>}
        {[...billingsByMonth].map(([month, list]) => (
          <div key={month} className="billing-month">
            <div className="billing-month-head">
              <span>{month}</span>
              <span>{yen(list.reduce((t, b) => t + b.amount, 0))}</span>
            </div>
            <ul className="list">
              {list.map((b) => {
                const account = accountOfOutflow(b, data.accounts)
                const credit = b.method.kind === 'credit'
                const fixed = b.fixedNames?.join('・')
                return (
                  <li key={outflowKey(b)}>
                    <span className="date">{formatMD(b.paymentDate)}</span>
                    <span className="grow">
                      {credit ? b.method.name : (fixed ?? b.method.name)}
                      {credit && fixed && <span className="muted small">固定費: {fixed}</span>}
                      {b.method.ownerId != null && <span className="owner">{memberName(b.method.ownerId)}</span>}
                      <span className="badges">
                        {credit ? (
                          <span className={`badge ${b.confirmed ? 'ok' : ''}`}>
                            {b.confirmed ? '確定' : `${formatMD(b.closingDate)}締め`}
                          </span>
                        ) : (
                          <span className="badge">口座引落</span>
                        )}
                        {b.includesEstimate && <span className="badge est">見込み含む</span>}
                      </span>
                      {account && <span className="muted small">引落口座: {account.name}</span>}
                    </span>
                    <span className="amount">{yen(b.amount)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </Collapsible>

      {(s.fixed.length > 0 || s.otherFixed.length > 0) && (
        <Collapsible id="fixed" title="今サイクルの固定費">
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
            {s.fixed.map((f) => {
              // 実額が入力済みなら、その支出をタップして金額などを直せる（複数あれば最新の 1 件）
              const entered = transactions
                .filter((t) => t.fixedCostId === f.cost.id && inCycle(t.date, cycle))
                .sort((a, b) => b.date.localeCompare(a.date))[0]
              return (
              <li key={f.cost.id} className={entered ? 'clickable' : undefined} onClick={entered ? () => onEntry(entered) : undefined}>
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
              )
            })}
          </ul>
        </Collapsible>
      )}
      {editingIncome && <IncomeForm status={editingIncome} cycle={incomeCycle} onClose={() => setEditingIncome(null)} />}
    </div>
  )
}
