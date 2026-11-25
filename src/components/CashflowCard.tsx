import { Fragment, useState } from 'react'
import { Collapsible } from './Collapsible'
import {
  cashflowFor,
  cycleEvents,
  isSettled,
  shortageKind,
  projectAccounts,
  type AccountEvent,
  type IncomeStatus,
  outflowKey,
  type Outflow,
  type OutflowItem,
} from '../lib/budget'
import { addDays } from 'date-fns'
import { formatMD, fromYMD, toYMD, todayYMD, type Cycle } from '../lib/dates'
import { accountLedger } from '../lib/ledger'
import type { Account, Adjustment, ExtraIncome, PaymentMethod, Prepayment, Transaction, Transfer, YMD } from '../lib/types'
import { yen, type AppData } from '../useData'
import { BalanceForm } from './BalanceForm'
import { IncomeForm } from './IncomeForm'
import { isBonusEstimate } from '../lib/bonus'
import { AccountMoveForm } from './AccountMoveForm'
import { AdjustmentForm } from './AdjustmentForm'
import { LedgerSheet } from './LedgerSheet'
import { PrepaymentForm, type BillInfo } from './PrepaymentForm'
import { TransferForm } from './TransferForm'

interface Props {
  data: AppData
  /** 表示するサイクル（今回・次回・次々回） */
  cycles: Cycle[]
  /** 口座残高の入力日から表示の手前までのサイクル（繰越の計算にだけ使う） */
  leadCycles: Cycle[]
  flows: Outflow[]
  /** 中身の支出をタップしたときに、編集画面を開く */
  onEditTx?: (tx: Transaction) => void
}

const paydayLabel = (c: Cycle) => {
  const d = fromYMD(c.start)
  return `${d.getMonth() + 1}/${d.getDate()}の給料`
}

const NEW_ACCOUNT = '__new'

/** 給料ごとに「その期間の引落・支払いを済ませたあと、いくら残るか」を表示する */
export function CashflowCard({ data, cycles, leadCycles, flows, onEditTx }: Props) {
  const { settings, accounts, transfers, adjustments, prepayments } = data
  // 初期表示は設定で選ぶ（既定は今回の給料。カード払い中心なら、使った分が引き落とされる次の給料にもできる）
  const [selected, setSelected] = useState(Math.min(settings.cashflowInitial === 'next' ? 1 : 0, cycles.length - 1))
  const [editingIncome, setEditingIncome] = useState<IncomeStatus | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [editingTransfer, setEditingTransfer] = useState<Partial<Transfer> | null>(null)
  const [editingExtra, setEditingExtra] = useState<Partial<ExtraIncome> | null>(null)
  // 口座の残高の推移（口座の ID）と、残高の微調整の入力
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<Partial<Adjustment> | null>(null)
  // カードの請求の事前支払い（ATMなど）の入力
  const [prepaying, setPrepaying] = useState<{ bill: BillInfo; initial?: Prepayment & { id: string } } | null>(null)
  // 中身を開いている行（出金の行のキー）
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const toggleRow = (key: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  /** 出金の中身（個々の支出・固定費の見込み・予定の出費）の一覧 */
  const detailRows = (key: string, items: OutflowItem[]) =>
    openRows.has(key)
      ? [...items]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((it, i) => {
            const tx = it.txId ? data.transactions.find((t) => t.id === it.txId) : undefined
            const editable = !!(tx && onEditTx)
            return (
              <li
                key={`${key}-item-${i}`}
                className={`cf-detail ${editable ? 'clickable' : ''}`}
                onClick={editable ? () => onEditTx!(tx!) : undefined}
              >
                <span className="date">{formatMD(it.date)}</span>
                <span className="grow">
                  <span>
                    {it.label || '（メモなし）'}
                    {it.estimate && <span className="badge est">見込み</span>}
                  </span>
                </span>
                <span className="amount">−{yen(it.amount)}</span>
              </li>
            )
          })
      : []

  const toCashflow = (c: Cycle) => cashflowFor(c, data.members, data.incomes, flows, settings, data.extraIncomes)
  const lead = leadCycles.map(toCashflow)
  const all = cycles.map(toCashflow)
  const carries = projectAccounts([...lead, ...all], accounts, settings, transfers, adjustments, prepayments)?.slice(lead.length) ?? null

  const cf = all[selected]
  const carry = carries?.[selected]
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const tracked = (id: string) => {
    const a = accountById.get(id)
    return a?.balance != null && a.balanceDate ? a : undefined
  }
  const untracked = accounts.filter((a) => a.balance == null || !a.balanceDate)

  // 各予定が、口座残高に反映済みか
  const events = new Map(cycleEvents(cf, accounts, settings, transfers, adjustments, prepayments).map((e) => [e.key, e]))
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
      .flatMap((c) => cycleEvents(c, list, settings, transfers, adjustments, prepayments))
      .filter((e) => e.accountId === target && e.date === date)
  }

  const memberName = (id?: string) => data.members.find((m) => m.id === id)?.name
  const doneBadge = <span className="badge">残高に反映済み</span>
  const acctTag = (key: string) => {
    const n = accountName(key)
    return n ? <span className="owner"> {n}</span> : null
  }

  // 現金・QR などは支払い方法ごとにまとめ、残高に反映済みの分と分ける
  const direct = new Map<string, { method: PaymentMethod; pending: number; done: number; estimate: boolean; doneItems: OutflowItem[]; pendingItems: OutflowItem[] }>()
  for (const o of cf.items) {
    if (o.method.kind === 'credit') continue
    const d = direct.get(o.method.id!) ?? { method: o.method, pending: 0, done: 0, estimate: false, doneItems: [], pendingItems: [] }
    if (settled(outflowKey(o))) {
      d.done += o.amount
      d.doneItems.push(...o.items)
    } else {
      d.pending += o.amount
      d.pendingItems.push(...o.items)
    }
    d.estimate ||= o.includesEstimate
    direct.set(o.method.id!, d)
  }

  const nextOrder = Math.max(0, ...accounts.map((a) => a.order)) + 1
  const cycleTransfers = transfers.filter((t) => t.date >= cf.cycle.start && t.date <= cf.cycle.end)
  const cycleAdjustments = adjustments.filter((a) => a.date >= cf.cycle.start && a.date <= cf.cycle.end)
  const ledgerAccount = ledgerAccountId ? accounts.find((a) => a.id === ledgerAccountId) : undefined
  const ledger = ledgerAccount ? accountLedger(ledgerAccount, accounts, [...lead, ...all], settings, transfers, adjustments, prepayments) : null

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
    <Collapsible id="cashflow" title="給料ごとの残り" className="card cashflow">
      <p className="muted small">
        その給料から、次の給料日の前日までの引落・支払いを払ったあとに残る額
        {carries && '（口座残高からの繰越込み）'}
      </p>

      <div className="cf-tabs" role="tablist">
        {all.map((c, i) => {
          const main = carries ? carries[i].closing : c.remaining
          const kind = carries ? shortageKind(carries[i]) : null
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
              {kind ? (
                kind === 'transfer' ? (
                  <span className="cf-tab-note">要振替</span>
                ) : (
                  <span className="cf-tab-note neg">残高不足</span>
                )
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
              <button className="link-btn ledger-link" onClick={() => setLedgerAccountId(c.account.id!)} aria-label={`${c.account.name}の残高の推移`}>
                {c.account.name}
                {c.fromInput ? `（${formatMD(c.account.balanceDate!)}時点の残高）` : '（繰越）'} ›
              </button>
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
        {carry && carry.accounts.length > 1 && (
          <li className="cf-opening-total">
            <span className="grow">
              使える金額（口座の合計）
              {untracked.length > 0 && <span className="muted small">残高未入力の口座は含みません</span>}
            </span>
            <span className={`amount ${carry.opening < 0 ? 'neg' : ''}`}>{yen(carry.opening)}</span>
          </li>
        )}
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
        {accounts.length >= 1 && (
          <li>
            <button className="link-btn" onClick={() => setEditingExtra({})}>
              ＋ 口座の入出金（引落・振込・入金）を記録する
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
          const key = outflowKey(o)
          const mine = prepayments.filter((p) => p.billKey === key)
          const prepaid = mine.reduce((s, p) => s + p.amount, 0)
          const bill: BillInfo = { billKey: key, methodName: o.method.name, paymentDate: o.paymentDate, amount: o.amount, paidOthers: prepaid }
          return (
            <Fragment key={key}>
            <li className={`clickable ${settled(key) ? 'done' : ''}`} onClick={() => toggleRow(key)} aria-expanded={openRows.has(key)}>
              <span className="date">{formatMD(o.paymentDate)}</span>
              <span className="grow">
                <span>
                  {o.method.name}
                  <span className="muted small"> {openRows.has(key) ? '▴' : '▾'} 中身</span>
                  {o.method.ownerId != null && <span className="owner"> {memberName(o.method.ownerId)}</span>}
                  {acctTag(key)}
                </span>
                <span>
                  <span className={`badge ${o.confirmed ? 'ok' : ''}`}>
                    {o.confirmed ? '確定' : `${formatMD(o.closingDate)}締め`}
                  </span>
                  {o.includesEstimate && <span className="badge est">見込み含む</span>}
                  {settled(key) && doneBadge}
                  {prepaid > 0 && (
                    <span className="badge ok">
                      事前支払い済み −{yen(prepaid)}
                      {prepaid < o.amount && `（引落 ${yen(o.amount - prepaid)}）`}
                    </span>
                  )}
                </span>
              </span>
              <span className="amount">−{yen(o.amount)}</span>
            </li>
            {detailRows(key, o.items)}
            {openRows.has(key) &&
              mine.map((p) => (
                <li
                  key={p.id}
                  className="cf-detail clickable"
                  onClick={() => setPrepaying({ bill: { ...bill, paidOthers: prepaid - p.amount }, initial: p })}
                >
                  <span className="date">{formatMD(p.paidDate)}</span>
                  <span className="grow">
                    <span>
                      事前に支払い（{p.accountId ? `${accountById.get(p.accountId)?.name ?? '口座'}から出金` : '口座を使わない'}）
                    </span>
                    {p.memo && <span className="muted small">{p.memo}</span>}
                  </span>
                  <span className="amount">{yen(p.amount)}</span>
                </li>
              ))}
            {openRows.has(key) && (
              <li className="cf-detail">
                <button className="link-btn" onClick={() => setPrepaying({ bill })}>
                  ＋ ATMなどで事前に支払った（口座引落ではない）
                </button>
              </li>
            )}
            </Fragment>
          )
        })}
        {[...direct.values()].flatMap((d) => [
          ...(d.done
            ? [
                <Fragment key={`${d.method.id}-done`}>
                  <li className="clickable done" onClick={() => toggleRow(`${d.method.id}-done`)} aria-expanded={openRows.has(`${d.method.id}-done`)}>
                    <span className="date">期間中</span>
                    <span className="grow">
                      <span>
                        {d.method.name}での支払い{doneBadge}
                        <span className="muted small"> {openRows.has(`${d.method.id}-done`) ? '▴' : '▾'} 中身</span>
                      </span>
                    </span>
                    <span className="amount">−{yen(d.done)}</span>
                  </li>
                  {detailRows(`${d.method.id}-done`, d.doneItems)}
                </Fragment>,
              ]
            : []),
          ...(d.pending
            ? [
                <Fragment key={`${d.method.id}-pending`}>
                  <li className="clickable" onClick={() => toggleRow(`${d.method.id}-pending`)} aria-expanded={openRows.has(`${d.method.id}-pending`)}>
                    <span className="date">期間中</span>
                    <span className="grow">
                      <span>
                        {d.method.name}での支払い
                        {d.estimate && <span className="badge est">見込み含む</span>}
                        <span className="muted small"> {openRows.has(`${d.method.id}-pending`) ? '▴' : '▾'} 中身</span>
                      </span>
                    </span>
                    <span className="amount">−{yen(d.pending)}</span>
                  </li>
                  {detailRows(`${d.method.id}-pending`, d.pendingItems)}
                </Fragment>,
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
        {cycleAdjustments.map((a) => {
          const done = settled(`adjust:${a.id}`)
          const label = accountById.get(a.accountId)?.name
          return (
            <li
              key={a.id}
              className={`clickable ${done ? 'done' : ''}`}
              onClick={() => {
                setLedgerAccountId(a.accountId)
                setAdjusting(a)
              }}
            >
              <span className="date">{formatMD(a.date)}</span>
              <span className="grow">
                <span>
                  残高の調整{label && accounts.length > 1 && ` → ${label}`}
                  {done && doneBadge}
                </span>
                {a.memo && <span className="muted small">{a.memo}</span>}
              </span>
              <span className={`amount ${a.amount < 0 ? '' : 'transfer'}`}>
                {a.amount > 0 ? '+' : ''}
                {yen(a.amount)}
              </span>
            </li>
          )
        })}
        {cf.extras.map((x) => {
          const done = settled(`extra:${x.id}`)
          const estimate = isBonusEstimate(x)
          // 入金先の口座（賞与の見込みで口座が未設定なら、最初の口座）
          const toAccount = accountById.get(x.accountId) ?? accounts[0]
          return (
            <li
              key={x.id}
              className={`clickable ${done ? 'done' : ''}`}
              // 賞与の見込み額は、実額を入力する新規の入金として開く
              onClick={accounts.length > 0 ? () => setEditingExtra(estimate ? { ...x, id: undefined } : x) : undefined}
            >
              <span className="date">{formatMD(x.date)}</span>
              <span className="grow">
                <span>
                  {x.bonusKey ? x.memo : '臨時収入'}
                  {x.bonusKey && <span className={`badge ${estimate ? 'est' : 'ok'}`}>{estimate ? '見込み' : '実額'}</span>}
                  {accounts.length > 1 && toAccount && ` → ${toAccount.name}`}
                  {done && doneBadge}
                </span>
                {!x.bonusKey && x.memo && <span className="muted small">{x.memo}</span>}
                {x.bonusKey && x.date < cf.cycle.start && (
                  <span className="muted small">給料日までに入金済み。この期間の支払いに使えます</span>
                )}
              </span>
              <span className="amount">+{yen(x.amount)}</span>
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
                  <span className="grow">
                    　
                    <button className="link-btn ledger-link" onClick={() => setLedgerAccountId(c.account.id!)} aria-label={`${c.account.name}の残高の推移`}>
                      {c.account.name} ›
                    </button>
                  </span>
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
        .flatMap((c) => {
          // 不足がいくつも続く場合は、出金ごとに案内し、いちばん不足する時点まで補えるようにする
          const list = c.shortages.length ? c.shortages : [c.shortage!]
          const worst = Math.min(...list.map((s) => s.balance))
          const canTransfer = shortageKind(carry) === 'transfer'
          return list.map((s, i) => (
            <p key={`${c.account.id}-${s.date}-${s.label}`} className="cf-warn neg">
              ⚠ {formatMD(s.date)}の{s.label}で、{c.account.name}の残高が{yen(s.balance)}
              になります。{i === 0 && (canTransfer ? 'ほかの口座からの振替で補えます。' : '事前に入金が必要です。')}
              {i === 0 && list.length > 1 && `（このあとも不足が続き、最大 ${yen(worst)} になります）`}
              {i === 0 && accounts.length >= 2 && (
                <button
                  className="link-btn warn-action"
                  onClick={() => coverShortage(c.account.id!, s.date, worst)}
                >
                  振替で補う
                </button>
              )}
            </p>
          ))
        })}
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
      {editingExtra && (
        <AccountMoveForm
          accounts={accounts}
          fixedCosts={data.fixedCosts}
          initial={editingExtra}
          onClose={() => setEditingExtra(null)}
        />
      )}
      {editingTransfer && (
        <TransferForm accounts={accounts} initial={editingTransfer} onClose={() => setEditingTransfer(null)} />
      )}
      {prepaying && <PrepaymentForm accounts={accounts} bill={prepaying.bill} initial={prepaying.initial} onClose={() => setPrepaying(null)} />}
      {ledger && !adjusting && !editingAccount && (
        <LedgerSheet
          ledger={ledger}
          onClose={() => setLedgerAccountId(null)}
          onAdjust={(initial) => setAdjusting(initial ? (adjustments.find((a) => a.id === initial.id) ?? {}) : {})}
          onEditBalance={() => ledgerAccount && setEditingAccount(ledgerAccount)}
        />
      )}
      {ledger && adjusting && <AdjustmentForm ledger={ledger} initial={adjusting} onClose={() => setAdjusting(null)} />}
      {editingAccount && (
        <BalanceForm account={editingAccount} eventsOn={eventsOn} onClose={() => setEditingAccount(null)} />
      )}
    </Collapsible>
  )
}
