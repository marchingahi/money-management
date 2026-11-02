import { describe, expect, it } from 'vitest'
import { backupToDataSet } from '../db'
import { cashflowFor, cycleEvents, isSettled, outflows, projectAccounts } from './budget'
import { cycleOf } from './dates'
import type { Account, ExtraIncome, PaymentMethod, Settings, Transaction } from './types'

const settings = { id: 'main', cycleStartDay: 25, savings: 0 } as Settings
const cycle = cycleOf('2026-10-27', { startDay: 25, businessDay: true }) // 10/23〜11/24
const accounts: Account[] = [
  { id: 'a1', name: 'Olive', order: 1, balance: 10000, balanceDate: '2026-10-23' },
  { id: 'a2', name: '三井住友', order: 2, balance: 500000, balanceDate: '2026-10-23' },
]
const bank: PaymentMethod = { id: 'b', name: 'Olive', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 1, accountId: 'a1' }
const extra = (id: string, date: string, amount: number, accountId = 'a1', memo = ''): ExtraIncome => ({ id, date, amount, accountId, memo })

describe('臨時収入', () => {
  it('その期間の臨時収入だけを集め、残りに加える', () => {
    const xs = [extra('x1', '2026-10-30', 30000), extra('x2', '2026-11-10', 5000), extra('x3', '2026-11-30', 99999)]
    const cf = cashflowFor(cycle, [], [], [], settings, xs)
    expect(cf.extras.map((x) => x.id)).toEqual(['x1', 'x2']) // 11/30 は次のサイクル
    expect(cf.extraTotal).toBe(35000)
    expect(cf.remaining).toBe(35000)
    // 指定しなければ従来どおり
    expect(cashflowFor(cycle, [], [], [], settings).remaining).toBe(0)
  })

  it('入金先の口座の入金予定になり、メモはラベルに出る', () => {
    const cf = cashflowFor(cycle, [], [], [], settings, [extra('x1', '2026-10-30', 30000, 'a2', '還付金')])
    expect(cycleEvents(cf, accounts, settings).map((e) => [e.key, e.accountId, e.amount, e.label, e.date])).toEqual([
      ['extra:x1', 'a2', 30000, '臨時収入（還付金）', '2026-10-30'],
    ])
  })

  it('口座残高に加わり、同じ日の引落の前に数えるので、不足を防げる', () => {
    // 11/26 の Olive 引落 20,000 に対して、口座 a1 の残高は 10,000
    const tx: Transaction = { id: 't', date: '2026-10-10', amount: 20000, category: '食費', methodId: 'b', memo: '' }
    const flows = outflows('2026-10-23', [bank], [tx], [], [])
    const next = cycleOf('2026-11-27', { startDay: 25, businessDay: true })
    const cfs = (xs: ExtraIncome[]) => [cycle, next].map((c) => cashflowFor(c, [], [], flows, settings, xs))

    const [, withoutExtra] = projectAccounts(cfs([]), accounts, settings)!
    expect(withoutExtra.accounts[0].shortage).toMatchObject({ date: '2026-11-26', balance: -10000 })

    // 引落と同じ日に 15,000 入れば、不足にならない（入金を先に数える）
    const [, covered] = projectAccounts(cfs([extra('x1', '2026-11-26', 15000)]), accounts, settings)!
    expect(covered.accounts[0].shortage).toBeNull()
    expect(covered.accounts[0].closing).toBe(10000 + 15000 - 20000)
  })

  it('残高を入力した日より前の臨時収入は、残高に反映済みとして扱う', () => {
    const cf = cashflowFor(cycle, [], [], [], settings, [extra('x1', '2026-10-23', 1000), extra('x2', '2026-10-24', 2000)])
    const [e1, e2] = cycleEvents(cf, accounts, settings)
    expect(isSettled(e1, accounts[0])).toBe(true) // 残高入力日当日で未反映の指定がなければ反映済み
    expect(isSettled(e2, accounts[0])).toBe(false)
  })

  it('古いバックアップ（臨時収入がない）も読める', () => {
    const data = backupToDataSet({ version: 2, exportedAt: '', members: [], incomes: [], methods: [], fixedCosts: [], transactions: [], settings: [] })
    expect(data.extraIncomes).toEqual([])
  })
})
