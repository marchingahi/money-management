import { useState } from 'react'
import {
  applyCarry,
  cashflowFor,
  incomeDate,
  isPending,
  type IncomeStatus,
  type Outflow,
} from '../lib/budget'
import { formatMD, fromYMD, type Cycle } from '../lib/dates'
import type { PaymentMethod } from '../lib/types'
import { yen, type AppData } from '../useData'
import { BalanceForm } from './BalanceForm'
import { IncomeForm } from './IncomeForm'

interface Props {
  data: AppData
  /** 表示するサイクル（今回・次回・次々回） */
  cycles: Cycle[]
  /** 口座残高の入力日から表示の手前までのサイクル（繰越の計算にだけ使う） */
  leadCycles: Cycle[]
  flows: Outflow[]
}

const paydayLabel = (c: Cycle) => {
  const d = fromYMD(c.start)
  return `${d.getMonth() + 1}/${d.getDate()}の給料`
}

/** 給料ごとに「その期間の引落・支払いを済ませたあと、いくら残るか」を表示する */
export function CashflowCard({ data, cycles, leadCycles, flows }: Props) {
  const { settings } = data
  // 今カードで使った分が引き落とされるのは主に次の給料なので、次の給料を初期表示にする
  const [selected, setSelected] = useState(Math.min(1, cycles.length - 1))
  const [editingIncome, setEditingIncome] = useState<IncomeStatus | null>(null)
  const [editingBalance, setEditingBalance] = useState(false)

  const toCashflow = (c: Cycle) => cashflowFor(c, data.members, data.incomes, flows, settings)
  const all = cycles.map(toCashflow)
  const hasBalance = settings.balance != null && settings.balanceDate != null
  const balanceDate = settings.balanceDate ?? ''
  const carries = hasBalance
    ? applyCarry([...leadCycles.map(toCashflow), ...all], settings.balance!, balanceDate).slice(leadCycles.length)
    : null

  const cf = all[selected]
  const carry = carries?.[selected]
  const done = (date: string) => hasBalance && !isPending(date, balanceDate)
  const memberName = (id?: string) => data.members.find((m) => m.id === id)?.name

  // 現金・QR などは支払い方法ごとにまとめ、残高に反映済みの分と分ける
  const direct = new Map<string, { method: PaymentMethod; pending: number; done: number; estimate: boolean }>()
  for (const o of cf.items) {
    if (o.method.kind === 'credit') continue
    const d = direct.get(o.method.id!) ?? { method: o.method, pending: 0, done: 0, estimate: false }
    if (done(o.paymentDate)) d.done += o.amount
    else d.pending += o.amount
    d.estimate ||= o.includesEstimate
    direct.set(o.method.id!, d)
  }

  const doneBadge = <span className="badge">残高に反映済み</span>

  return (
    <section className="card cashflow">
      <h2>給料ごとの残り</h2>
      <p className="muted small">
        その給料から、次の給料日の前日までの引落・支払いを払ったあとに残る額
        {hasBalance && '（口座残高からの繰越込み）'}
      </p>

      <div className="cf-tabs" role="tablist">
        {all.map((c, i) => {
          const main = carries ? carries[i].closing : c.remaining
          return (
            <button
              key={c.cycle.start}
              role="tab"
              aria-selected={i === selected}
              className={`cf-tab ${i === selected ? 'on' : ''}`}
              onClick={() => setSelected(i)}
            >
              <span className="cf-tab-label">{paydayLabel(c.cycle)}</span>
              <span className={`cf-tab-amount ${main < 0 ? 'neg' : ''}`}>{yen(main)}</span>
              {c.open && <span className="cf-tab-note">変動中</span>}
            </button>
          )
        })}
      </div>

      <p className="cf-period muted small">
        {formatMD(cf.cycle.start)} 〜 {formatMD(cf.cycle.end)} の入出金
      </p>
      <ul className="list">
        {carry ? (
          <li className="cf-opening">
            <span className="grow">
              {carry.fromInput ? `口座残高（${formatMD(balanceDate)}時点）` : '前の給料からの繰越'}
            </span>
            {carry.fromInput ? (
              <button className="link-btn amount" onClick={() => setEditingBalance(true)}>
                {yen(carry.opening)} ✎
              </button>
            ) : (
              <span className={`amount ${carry.opening < 0 ? 'neg' : ''}`}>{yen(carry.opening)}</span>
            )}
          </li>
        ) : (
          <li>
            <button className="link-btn" onClick={() => setEditingBalance(true)}>
              ＋ 口座残高を入れて、繰越も含めて計算する
            </button>
          </li>
        )}
        {cf.incomes.map((i) => (
          <li key={i.member.id} className={done(incomeDate(cf.cycle, i.member)) ? 'done' : ''}>
            <span className="grow">
              <span>
                {i.member.name}の手取り
                <span className={`badge ${i.actual != null ? 'ok' : 'est'}`}>{i.actual != null ? '実額' : '見込み'}</span>
                {done(incomeDate(cf.cycle, i.member)) && doneBadge}
              </span>
            </span>
            <button className="link-btn amount" onClick={() => setEditingIncome(i)}>
              {yen(i.amount)} ✎
            </button>
          </li>
        ))}
        {cf.cards.map((o) => (
          <li key={`${o.method.id}-${o.paymentDate}`} className={done(o.paymentDate) ? 'done' : ''}>
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
                {done(o.paymentDate) && doneBadge}
              </span>
            </span>
            <span className="amount">−{yen(o.amount)}</span>
          </li>
        ))}
        {[...direct.values()].flatMap((d) => [
          ...(d.done
            ? [
                <li key={`${d.method.id}-done`} className="done">
                  <span className="date">期間中</span>
                  <span className="grow">
                    <span>
                      {d.method.name}での支払い{doneBadge}
                    </span>
                  </span>
                  <span className="amount">−{yen(d.done)}</span>
                </li>,
              ]
            : []),
          ...(d.pending
            ? [
                <li key={`${d.method.id}-pending`}>
                  <span className="date">期間中</span>
                  <span className="grow">
                    <span>
                      {d.method.name}での支払い
                      {d.estimate && <span className="badge est">見込み含む</span>}
                    </span>
                  </span>
                  <span className="amount">−{yen(d.pending)}</span>
                </li>,
              ]
            : []),
        ])}
        {cf.savings > 0 && (
          <li className={done(cf.cycle.start) ? 'done' : ''}>
            <span className="grow">
              <span>先取り貯金{done(cf.cycle.start) && doneBadge}</span>
            </span>
            <span className="amount">−{yen(cf.savings)}</span>
          </li>
        )}
        {carry ? (
          <>
            <li className="cf-sub">
              <span className="grow">この給料だけで見た残り</span>
              <span className={`amount ${cf.remaining < 0 ? 'neg' : ''}`}>{yen(cf.remaining)}</span>
            </li>
            <li className="cf-total">
              <span className="grow">繰越込みの残り（{formatMD(cf.cycle.end)}時点）</span>
              <span className={`amount ${carry.closing < 0 ? 'neg' : ''}`}>{yen(carry.closing)}</span>
            </li>
          </>
        ) : (
          <li className="cf-total">
            <span className="grow">残り</span>
            <span className={`amount ${cf.remaining < 0 ? 'neg' : ''}`}>{yen(cf.remaining)}</span>
          </li>
        )}
      </ul>
      {cf.open && (
        <p className="cf-warn">締め日前のカードがあります。これからそのカードで使うと、この残りが減ります。</p>
      )}
      {hasBalance && balanceDate < cycles[0].start && (
        <p className="cf-warn">口座残高が前回の給料日より前の日付です。今の残高に更新すると正確になります。</p>
      )}

      {editingIncome && (
        <IncomeForm status={editingIncome} cycle={cf.cycle} onClose={() => setEditingIncome(null)} />
      )}
      {editingBalance && <BalanceForm settings={settings} onClose={() => setEditingBalance(false)} />}
    </section>
  )
}
