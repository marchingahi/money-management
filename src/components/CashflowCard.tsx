import { useState } from 'react'
import { cashflowFor, type IncomeStatus, type Outflow } from '../lib/budget'
import { formatMD, fromYMD, type Cycle } from '../lib/dates'
import { yen, type AppData } from '../useData'
import { IncomeForm } from './IncomeForm'

interface Props {
  data: AppData
  cycles: Cycle[]
  flows: Outflow[]
}

const paydayLabel = (c: Cycle) => {
  const d = fromYMD(c.start)
  return `${d.getMonth() + 1}/${d.getDate()}の給料`
}

/** 給料ごとに「その期間の引落・支払いを済ませたあと、いくら残るか」を表示する */
export function CashflowCard({ data, cycles, flows }: Props) {
  // 今カードで使った分が引き落とされるのは主に次の給料なので、次の給料を初期表示にする
  const [selected, setSelected] = useState(Math.min(1, cycles.length - 1))
  const [editingIncome, setEditingIncome] = useState<IncomeStatus | null>(null)
  const all = cycles.map((c) => cashflowFor(c, data.members, data.incomes, flows, data.settings))
  const cf = all[selected]
  const memberName = (id?: number) => data.members.find((m) => m.id === id)?.name

  return (
    <section className="card cashflow">
      <h2>給料ごとの残り</h2>
      <p className="muted small">その給料から、次の給料日の前日までの引落・支払いを払ったあとに残る額</p>

      <div className="cf-tabs" role="tablist">
        {all.map((c, i) => (
          <button
            key={c.cycle.start}
            role="tab"
            aria-selected={i === selected}
            className={`cf-tab ${i === selected ? 'on' : ''}`}
            onClick={() => setSelected(i)}
          >
            <span className="cf-tab-label">{paydayLabel(c.cycle)}</span>
            <span className={`cf-tab-amount ${c.remaining < 0 ? 'neg' : ''}`}>{yen(c.remaining)}</span>
            {c.open && <span className="cf-tab-note">変動中</span>}
          </button>
        ))}
      </div>

      <p className="cf-period muted small">
        {formatMD(cf.cycle.start)} 〜 {formatMD(cf.cycle.end)} の入出金
      </p>
      <ul className="list">
        {cf.incomes.map((i) => (
          <li key={i.member.id}>
            <span className="grow">
              <span>
                {i.member.name}の手取り
                <span className={`badge ${i.actual != null ? 'ok' : 'est'}`}>{i.actual != null ? '実額' : '見込み'}</span>
              </span>
            </span>
            <button className="link-btn amount" onClick={() => setEditingIncome(i)}>
              {yen(i.amount)} ✎
            </button>
          </li>
        ))}
        {cf.cards.map((o) => (
          <li key={`${o.method.id}-${o.paymentDate}`}>
            <span className="date">{formatMD(o.paymentDate)}</span>
            <span className="grow">
              <span>
                {o.method.name}
                {o.method.ownerId != null && <span className="owner"> {memberName(o.method.ownerId)}</span>}
              </span>
              <span>
                <span className={`badge ${o.confirmed ? 'ok' : ''}`}>
                  {o.confirmed ? '確定' : `${formatMD(o.closingDate)}締め`}
                </span>
                {o.includesEstimate && <span className="badge est">見込み含む</span>}
              </span>
            </span>
            <span className="amount">−{yen(o.amount)}</span>
          </li>
        ))}
        {cf.direct.map((d) => (
          <li key={d.method.id}>
            <span className="date">期間中</span>
            <span className="grow">
              <span>
                {d.method.name}での支払い
                {d.includesEstimate && <span className="badge est">見込み含む</span>}
              </span>
            </span>
            <span className="amount">−{yen(d.amount)}</span>
          </li>
        ))}
        {cf.savings > 0 && (
          <li>
            <span className="grow">先取り貯金</span>
            <span className="amount">−{yen(cf.savings)}</span>
          </li>
        )}
        <li className="cf-total">
          <span className="grow">残り</span>
          <span className={`amount ${cf.remaining < 0 ? 'neg' : ''}`}>{yen(cf.remaining)}</span>
        </li>
      </ul>
      {cf.open && (
        <p className="cf-warn">締め日前のカードがあります。これからそのカードで使うと、この残りが減ります。</p>
      )}

      {editingIncome && (
        <IncomeForm status={editingIncome} cycle={cf.cycle} onClose={() => setEditingIncome(null)} />
      )}
    </section>
  )
}
