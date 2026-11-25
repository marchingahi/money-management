import { describe, expect, it } from 'vitest'
import { accountLedger } from './ledger'
import { cashflowFor, committedBillings, cycleEvents, debitAmount, outflowKey, outflows, prepaidFor, projectAccounts } from './budget'
import { cycleOf, shiftCycle } from './dates'
import type { Account, PaymentMethod, Prepayment, Settings, Transaction } from './types'

const settings = { id: 'main', cycleStartDay: 25, savings: 0 } as Settings
const rule = { startDay: 25, businessDay: true }
const cycle = cycleOf('2026-10-27', rule) // 10/23〜11/24
const next = shiftCycle(cycle, 1, rule) // 11/25〜12/24
const accounts: (Account & { id: string })[] = [
  { id: 'a1', name: 'A', order: 1, balance: 100000, balanceDate: '2026-10-23' },
  { id: 'a2', name: 'B', order: 2, balance: 50000, balanceDate: '2026-10-23' },
]
// 月末締め 翌 26 日払い。10 月の利用は 11/26 に引き落とされる（口座 A）
const card: PaymentMethod = { id: 'c', name: 'カード', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 1, accountId: 'a1' }
const tx = (id: string, date: string, amount: number): Transaction => ({ id, date, amount, category: '食費', methodId: 'c', memo: '' })
const txs = [tx('1', '2026-10-05', 30000), tx('2', '2026-10-15', 20000)] // 11/26 引落: 50,000
const flows = outflows('2026-10-27', [card], txs, [], [cycle, next])
const bill = flows.find((f) => f.paymentDate === '2026-11-26')!
const pre = (over: Partial<Prepayment> = {}): Prepayment => ({
  id: 'p1',
  billKey: outflowKey(bill),
  methodName: 'カード',
  paymentDate: '2026-11-26',
  amount: 50000,
  paidDate: '2026-11-10',
  memo: '',
  ...over,
})
const carry = (prepayments: Prepayment[]) => {
  const cfs = [cycle, next].map((c) => cashflowFor(c, [], [], flows, settings))
  return { cfs, carries: projectAccounts(cfs, accounts, settings, [], [], prepayments)! }
}

describe('カードの請求の事前支払い', () => {
  it('請求の引落額 = 請求額 − 事前支払い（請求が増えた分は引き落とされる。マイナスにはしない）', () => {
    expect(bill.amount).toBe(50000)
    expect(debitAmount(bill, [])).toBe(50000)
    expect(prepaidFor(bill, [pre({ amount: 20000 })])).toBe(20000)
    expect(debitAmount(bill, [pre({ amount: 20000 })])).toBe(30000)
    expect(debitAmount(bill, [pre({ amount: 80000 })])).toBe(0)
    // 別の請求の事前支払いは影響しない
    expect(debitAmount(bill, [pre({ billKey: 'out:c@2026-12-26' })])).toBe(50000)
  })

  it('支払い元が口座を使わない（現金など）なら、引落日の口座の引落がなくなる', () => {
    const base = carry([]).carries[1].accounts[0]
    expect(base.closing).toBe(100000 - 50000)
    const paid = carry([pre()]).carries[1].accounts[0]
    expect(paid.closing).toBe(100000) // 引落なし
    expect(paid.shortage).toBeNull()
  })

  it('一部だけ事前に支払うと、残りは引落日に引き落とされる', () => {
    const c = carry([pre({ amount: 20000 })]).carries[1].accounts[0]
    expect(c.closing).toBe(100000 - 30000)
  })

  it('支払い元に口座を選ぶと、支払った日にその口座から出金し、引落日の引落はなくなる', () => {
    const { cfs, carries } = carry([pre({ accountId: 'a2' })])
    // 口座 B は、支払った日（11/10）に 50,000 出金 → 50,000 − 50,000 = 0。口座 A は引落がなく 100,000
    expect(carries[0].accounts.map((a) => [a.account.id, a.closing])).toEqual([
      ['a1', 100000],
      ['a2', 0],
    ])
    const events = cycleEvents(cfs[0], accounts, settings, [], [], [pre({ accountId: 'a2' })]).filter((e) => e.key === 'prepay:p1')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ accountId: 'a2', date: '2026-11-10', amount: -50000, label: 'カードの事前支払い' })
  })

  it('口座の残高の推移に、支払い元の出金が出て、引落日の引落は出ない', () => {
    const cfs = [cycle, next].map((c) => cashflowFor(c, [], [], flows, settings))
    const ledgerA = accountLedger(accounts[0], accounts, cfs, settings, [], [], [pre({ accountId: 'a2' })])!
    expect(ledgerA.entries.filter((e) => e.amount !== 0 && e.label.includes('カード'))).toEqual([])
    const ledgerB = accountLedger(accounts[1], accounts, cfs, settings, [], [], [pre({ accountId: 'a2' })])!
    expect(ledgerB.entries.map((e) => [e.date, e.amount, e.balance])).toEqual([['2026-11-10', -50000, 0]])
  })

  it('「実質あと使える額」の確定済みの引落から、事前に支払い済みの分を差し引く', () => {
    // 11/25〜の期間から見ると、10 月の利用分（11/26 引落）は「前のサイクルの利用分」
    const cur = cycleOf('2026-11-27', rule)
    const committed = (prepayments: Prepayment[]) => committedBillings(txs, [card], cur, cur, prepayments)
    expect(committed([]).map((c) => c.amount)).toEqual([50000])
    expect(committed([pre({ amount: 20000 })]).map((c) => c.amount)).toEqual([30000])
    expect(committed([pre()])).toEqual([]) // 全額支払い済みなら出ない
  })
})
