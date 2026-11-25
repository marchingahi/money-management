import { describe, expect, it } from 'vitest'
import { cashflowFor, outflows, projectAccounts } from './budget'
import { cycleOf, shiftCycle } from './dates'
import { accountLedger, expectedBalanceOn } from './ledger'
import type { Account, Adjustment, ExtraIncome, PaymentMethod, Settings, Transaction, Transfer } from './types'

const settings = { id: 'main', cycleStartDay: 25, savings: 0 } as Settings
const rule = { startDay: 25, businessDay: true }
const cycle = cycleOf('2026-10-27', rule) // 10/23〜11/24
const cycles = [0, 1].map((n) => shiftCycle(cycle, n, rule))
const accounts: (Account & { id: string })[] = [
  { id: 'a1', name: 'A', order: 1, balance: 100000, balanceDate: '2026-10-25' },
  { id: 'a2', name: 'B', order: 2, balance: 50000, balanceDate: '2026-10-25' },
]
const bank: PaymentMethod = { id: 'b', name: '口座引落', kind: 'debit', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 1, accountId: 'a1' }
const tx = (id: string, date: string, amount: number): Transaction => ({ id, date, amount, category: '固定費', methodId: 'b', memo: '' })
const txs = [tx('1', '2026-10-24', 7000), tx('2', '2026-10-30', 20000), tx('3', '2026-11-10', 5000)]
const transfers: Transfer[] = [{ id: 't', date: '2026-11-05', amount: 10000, fromAccountId: 'a2', toAccountId: 'a1', memo: '' }]
const extras: ExtraIncome[] = [{ id: 'x', date: '2026-11-02', amount: 3000, accountId: 'a1', memo: '還付' }]
const build = (adjustments: Adjustment[] = []) => {
  const flows = outflows('2026-10-27', [bank], txs, [], cycles)
  const cfs = cycles.map((c) => cashflowFor(c, [], [], flows, settings, extras))
  return { cfs, ledger: accountLedger(accounts[0], accounts, cfs, settings, transfers, adjustments)! }
}

describe('口座の残高の推移', () => {
  it('入力した残高から、入出金・振替・臨時収入を日付順に足し引きして、各時点の残高を出す', () => {
    const { ledger } = build()
    expect(ledger.base).toEqual({ date: '2026-10-25', balance: 100000 })
    expect(ledger.entries.map((e) => [e.date, e.amount, e.settled, e.balance])).toEqual([
      ['2026-10-24', -7000, true, 100000], // 残高を入れた 10/25 より前 → すでに残高に含まれている（残高は動かさない）
      ['2026-10-30', -20000, false, 80000],
      ['2026-11-02', 3000, false, 83000],
      ['2026-11-05', 10000, false, 93000],
      ['2026-11-10', -5000, false, 88000],
    ])
  })

  it('最後の残高は、口座の繰越（projectAccounts）の期末残高と一致する', () => {
    const { cfs, ledger } = build()
    const carries = projectAccounts(cfs, accounts, settings, transfers)!
    expect(ledger.entries[ledger.entries.length - 1].balance).toBe(carries[carries.length - 1].accounts[0].closing)
  })

  it('残高を入れていない口座は null', () => {
    const { cfs } = build()
    expect(accountLedger({ id: 'z', name: 'Z', order: 3 }, accounts, cfs, settings)).toBeNull()
  })

  it('指定した日の終わりの予想残高を出す', () => {
    const { ledger } = build()
    expect(expectedBalanceOn(ledger, '2026-10-25')).toBe(100000) // 起点の日
    expect(expectedBalanceOn(ledger, '2026-10-29')).toBe(100000)
    expect(expectedBalanceOn(ledger, '2026-10-30')).toBe(80000) // 当日の出金を含む
    expect(expectedBalanceOn(ledger, '2026-11-04')).toBe(83000)
    expect(expectedBalanceOn(ledger, '2026-12-31')).toBe(88000)
    expect(expectedBalanceOn(ledger, '2026-10-01')).toBe(100000) // 起点より前
  })
})

describe('残高の調整（微調整）', () => {
  const adj: Adjustment = { id: 'j', date: '2026-11-03', amount: -1500, accountId: 'a1', memo: '手数料' }

  it('口座の残高にだけ加わり、以降の残高がずれる', () => {
    const { ledger } = build([adj])
    const a = ledger.entries.find((e) => e.adjustmentId === 'j')!
    expect(a).toMatchObject({ date: '2026-11-03', amount: -1500, settled: false, label: '残高の調整（手数料）', balance: 81500 })
    expect(ledger.entries[ledger.entries.length - 1].balance).toBe(88000 - 1500)
  })

  it('ほかの口座や、収入・支出（給料ごとの残り）には影響しない', () => {
    const { cfs } = build([adj])
    const withAdj = projectAccounts(cfs, accounts, settings, transfers, [adj])!
    const without = projectAccounts(cfs, accounts, settings, transfers)!
    const last = withAdj.length - 1
    expect(withAdj[last].accounts[0].closing).toBe(without[last].accounts[0].closing - 1500)
    expect(withAdj[last].accounts[1].closing).toBe(without[last].accounts[1].closing) // 別の口座は変わらない
    // 収入・支出の集計は変わらない
    const flows = outflows('2026-10-27', [bank], txs, [], cycles)
    expect(cashflowFor(cycles[0], [], [], flows, settings, extras).remaining).toBe(cfs[0].remaining)
  })

  it('残高を入れた日以前の調整は、残高に含まれている扱いで、足し引きしない', () => {
    const early: Adjustment = { id: 'e', date: '2026-10-25', amount: 9999, accountId: 'a1', memo: '' }
    const { ledger } = build([early])
    const e = ledger.entries.find((x) => x.adjustmentId === 'e')!
    expect(e.settled).toBe(true)
    expect(ledger.entries[ledger.entries.length - 1].balance).toBe(88000)
  })
})
