import { useState } from 'react'
import {
  cashflowFor,
  cycleEvents,
  isSettled,
  projectAccounts,
  type AccountEvent,
  type IncomeStatus,
  type Outflow,
} from '../lib/budget'
import { addDays } from 'date-fns'
import { formatMD, fromYMD, toYMD, todayYMD, type Cycle } from '../lib/dates'
import type { Account, PaymentMethod, Transfer, YMD } from '../lib/types'
import { yen, type AppData } from '../useData'
import { BalanceForm } from './BalanceForm'
import { IncomeForm } from './IncomeForm'
import { TransferForm } from './TransferForm'

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

const NEW_ACCOUNT = '__new'

/** 給料ごとに「その期間の引落・支払いを済ませたあと、いくら残るか」を表示する */
export function CashflowCard({ data, cycles, leadCycles, flows }: Props) {
  const { settings, accounts, transfers } = data
  // 今カードで使った分が引き落とされるのは主に次の給料なので、次の給料を初期表示にする
  const [selected, setSelected] = useState(Math.min(1, cycles.length - 1))
  const [editingIncome, setEditingIncome] = useState<IncomeStatus | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [editingTransfer, setEditingTransfer] = useState<Partial<Transfer> | null>(null)

  const toCashflow = (c: Cycle) => cashflowFor(c, data.members, data.incomes, flows, settings)
  const lead = leadCycles.map(toCashflow)
  const all = cycles.map(toCashflow)
  const carries = projectAccounts([...lead, ...all], accounts, settings, transfers)?.slice(lead.length) ?? null

  const cf = all[selected]
  const carry = carries?.[selected]
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const tracked = (id: string) => {
    const a = accountById.get(id)
    return a?.balance != null && a.balanceDate ? a : undefined
  }
  const untracked = accounts.filter((a) => a.balance == null || !a.balanceDate)

  // 各予定が、口座残高に反映済みか
  const events = new Map(cycleEvents(cf, accounts, settings, transfers).map((e) => [e.key, e]))
  const settled = (key: string) => {
    const e = events.get(key)
    const a = e && tracked(e.accountId)
    return !!(e && a && isSettled(e, a))
  }
  const accountName = (key: string) => {
    const e = events.get(key)
    return e && accounts.length > 1 ? accountById.get(e.accountId)?.name : undefined
  }

  /** 残高入力画面に出す、指定日のその口座の予定 */
  const eventsOn = (date: YMD, accountId?: string): AccountEvent[] => {
    const list = accountId ? accounts : [...accounts, { id: NEW_ACCOUNT, name: '', order: 0 }]
    const target = accountId ?? NEW_ACCOUNT
    return [...lead, ...all]
      .flatMap((c) => cycleEvents(c, list, settings, transfers))
      .filter((e) => e.accountId === target && e.date === date)
  }

  const memberName = (id?: string) => data.members.find((m) => m.id === id)?.name
  const doneBadge = <span className="badge">残高に反映済み</span>
  const acctTag = (key: string) => {
    const n = accountName(key)
    return n ? <span className="owner"> {n}</span> : null
  }

  // 現金・QR などは支払い方法ごとにまとめ、残高に反映済みの分と分ける
  const direct = new Map<string, { method: PaymentMethod; pending: number; done: number; estimate: boolean }>()
  for (const o of cf.items) {
    if (o.method.kind === 'credit') continue
    const d = direct.get(o.method.id!) ?? { method: o.method, pending: 0, done: 0, estimate: false }
    if (settled(`out:${o.method.id}@${o.paymentDate}`)) d.done += o.amount
    else d.pending += o.amount
    d.estimate ||= o.includesEstimate
    direct.set(o.method.id!, d)
  }

  const nextOrder = Math.max(0, ...accounts.map((a) => a.order)) + 1
  const cycleTransfers = transfers.filter((t) => t.date >= cf.cycle.start && t.date <= cf.cycle.end)

  /** 残高不足を補う振替の初期値: 不足額（千円単位で切り上げ）を、引落の前日（今日より前なら今日）に、一番余裕のある口座から */
  const coverShortage = (accountId: string, date: YMD, balance: number) => {
    const donor = carry?.accounts
      .filter((c) => c.account.id !== accountId)
      .sort((a, b) => b.closing - a.closing)[0]
    const day = toYMD(addDays(fromYMD(date), -1))
    setEditingTransfer({
      amount: Math.ceil(-balance / 1000) * 1000,
      toAccountId: accountId,
      fromAccountId: donor?.account.id,
      date: day < todayYMD() ? todayYMD() : day,
    })
  }

  return (
    <section className="card cashflow">
      <h2>給料ごとの残り</h2>
      <p className="muted small">
        その給料から、次の給料日の前日までの引落・支払いを払ったあとに残る額
        {carries && '（口座残高からの繰越込み）'}
      </p>

      <div className="cf-tabs" role="tablist">
        {all.map((c, i) => {
          const main = carries ? carries[i].closing : c.remaining
          const short = carries?.[i].accounts.some((a) => a.shortage)
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
              {short ? (
                <span className="cf-tab-note neg">口座不足</span>
              ) : (
                c.open && <span className="cf-tab-note">変動中</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="cf-period muted small">
        {formatMD(cf.cycle.start)} 〜 {formatMD(cf.cycle.end)} の入出金
      </p>
      <ul className="list">
        {carry?.accounts.map((c) => (
          <li key={c.account.id} className="cf-opening">
            <span className="grow">
              {c.account.name}
              {c.fromInput ? `（${formatMD(c.account.balanceDate!)}時点の残高）` : '（繰越）'}
            </span>
            {c.fromInput ? (
              <button className="link-btn amount" onClick={() => setEditingAccount(c.account)}>
                {yen(c.opening)} ✎
              </button>
            ) : (
              <span className={`amount ${c.opening < 0 ? 'neg' : ''}`}>{yen(c.opening)}</span>
            )}
          </li>
        ))}
        {untracked.map((a) => (
          <li key={a.id}>
            <span className="grow muted">{a.name}（残高未入力）</span>
            <button className="link-btn" onClick={() => setEditingAccount(a)}>
              ＋ 残高を入れる
            </button>
          </li>
        ))}
        {accounts.length >= 2 && (
          <li>
            <button className="link-btn" onClick={() => setEditingTransfer({})}>
              ＋ 口座間の振替を記録する
            </button>
          </li>
        )}
        {accounts.length === 0 && (
          <li>
            <button
              className="link-btn"
              onClick={() => setEditingAccount({ name: 'メイン口座', order: nextOrder })}
            >
              ＋ 口座残高を入れて、繰越も含めて計算する
            </button>
          </li>
        )}

        {cf.incomes.map((i) => {
          const key = `income:${i.member.id}@${cf.cycle.start}`
          return (
            <li key={i.member.id} className={settled(key) ? 'done' : ''}>
              <span className="grow">
                <span>
                  {i.member.name}の手取り
                  {acctTag(key)}
                  <span className={`badge ${i.actual != null ? 'ok' : 'est'}`}>{i.actual != null ? '実額' : '見込み'}</span>
                  {settled(key) && doneBadge}
                </span>
              </span>
              <button className="link-btn amount" onClick={() => setEditingIncome(i)}>
                {yen(i.amount)} ✎
              </button>
            </li>
          )
        })}
        {cf.cards.map((o) => {
          const key = `out:${o.method.id}@${o.paymentDate}`
          return (
            <li key={key} className={settled(key) ? 'done' : ''}>
              <span className="date">{formatMD(o.paymentDate)}</span>
              <span className="grow">
                <span>
                  {o.method.name}
                  {o.method.ownerId != null && <span className="owner"> {memberName(o.method.ownerId)}</span>}
                  {acctTag(key)}
                </span>
                <span>
                  <span className={`badge ${o.confirmed ? 'ok' : ''}`}>
                    {o.confirmed ? '確定' : `${formatMD(o.closingDate)}締め`}
                  </span>
                  {o.includesEstimate && <span className="badge est">見込み含む</span>}
                  {settled(key) && doneBadge}
                </span>
              </span>
              <span className="amount">−{yen(o.amount)}</span>
            </li>
          )
        })}
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
          <li className={settled(`savings@${cf.cycle.start}`) ? 'done' : ''}>
            <span className="grow">
              <span>
                先取り貯金{acctTag(`savings@${cf.cycle.start}`)}
                {settled(`savings@${cf.cycle.start}`) && doneBadge}
              </span>
            </span>
            <span className="amount">−{yen(cf.savings)}</span>
          </li>
        )}
        {cycleTransfers.map((t) => {
          const done = settled(`transfer:${t.id}:out`) && settled(`transfer:${t.id}:in`)
          return (
            <li key={t.id} className={`clickable ${done ? 'done' : ''}`} onClick={() => setEditingTransfer(t)}>
              <span className="date">{formatMD(t.date)}</span>
              <span className="grow">
                <span>
                  振替 {accountById.get(t.fromAccountId)?.name} → {accountById.get(t.toAccountId)?.name}
                  {done && doneBadge}
                </span>
                {t.memo && <span className="muted small">{t.memo}</span>}
              </span>
              <span className="amount transfer">{yen(t.amount)}</span>
            </li>
          )
        })}
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
            {carry.accounts.length > 1 &&
              carry.accounts.map((c) => (
                <li key={c.account.id} className="cf-sub">
                  <span className="grow">　{c.account.name}</span>
                  <span className={`amount ${c.closing < 0 ? 'neg' : ''}`}>{yen(c.closing)}</span>
                </li>
              ))}
          </>
        ) : (
          <li className="cf-total">
            <span className="grow">残り</span>
            <span className={`amount ${cf.remaining < 0 ? 'neg' : ''}`}>{yen(cf.remaining)}</span>
          </li>
        )}
      </ul>
      {carry?.accounts
        .filter((c) => c.shortage)
        .map((c) => (
          <p key={c.account.id} className="cf-warn neg">
            ⚠ {formatMD(c.shortage!.date)}の{c.shortage!.label}で、{c.account.name}の残高が{yen(c.shortage!.balance)}
            になります。事前に入金が必要です。
            {accounts.length >= 2 && (
              <button
                className="link-btn warn-action"
                onClick={() => coverShortage(c.account.id!, c.shortage!.date, c.shortage!.balance)}
              >
                振替で補う
              </button>
            )}
          </p>
        ))}
      {cf.open && (
        <p className="cf-warn">締め日前のカードがあります。これからそのカードで使うと、この残りが減ります。</p>
      )}
      {carries && untracked.length > 0 && (
        <p className="cf-warn">
          残高未入力の口座（{untracked.map((a) => a.name).join('、')}）の入出金は、繰越に含まれていません。
        </p>
      )}

      {editingIncome && (
        <IncomeForm status={editingIncome} cycle={cf.cycle} onClose={() => setEditingIncome(null)} />
      )}
      {editingTransfer && (
        <TransferForm accounts={accounts} initial={editingTransfer} onClose={() => setEditingTransfer(null)} />
      )}
      {editingAccount && (
        <BalanceForm account={editingAccount} eventsOn={eventsOn} onClose={() => setEditingAccount(null)} />
      )}
    </section>
  )
}
