import { describe, expect, it } from 'vitest'
import { accountMethodId, isAccountMethodId, withAccountMethods } from './accountMethods'
import { accountOfOutflow, cashflowFor, outflows, projectAccounts, summarize } from './budget'
import { cycleOf } from './dates'
import type { Account, FixedCost, Member, PaymentMethod, Settings, Transaction } from './types'

const settings = { id: 'main', cycleStartDay: 25, savings: 0 } as Settings
const rule = { startDay: 25, businessDay: true }
const cycle = cycleOf('2026-10-27', rule) // 10/23〜11/24
const incomeCycle = cycleOf('2026-11-27', rule)
const accounts: (Account & { id: string })[] = [
  { id: 'a1', name: 'Olive', order: 1, balance: 50000, balanceDate: '2026-10-23' },
  { id: 'a2', name: '三井住友', order: 2, balance: 500000, balanceDate: '2026-10-23' },
]
const card: PaymentMethod & { id: string } = { id: 'c', name: 'カード', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 3, accountId: 'a1' }
const member = { id: 'p', name: '自分', payday: 25, payType: 'monthly', takeHome: 300000, hourlyWage: 0, hoursPerDay: 0, daysPerMonth: 0, deductionRate: 0 } as unknown as Member
const methods = withAccountMethods([card], accounts)
const tx = (id: string, date: string, amount: number, accountId: string, extra: Partial<Transaction> = {}): Transaction => ({
  id,
  date,
  amount,
  category: '固定費',
  methodId: accountMethodId(accountId),
  memo: '',
  ...extra,
})

describe('口座引落・振込の支払い方法', () => {
  it('口座ごとに、保存しない支払い方法を用意する（実際の支払い方法のあとに並ぶ）', () => {
    expect(methods.map((m) => [m.id, m.name, m.virtual ?? false])).toEqual([
      ['c', 'カード', false],
      ['acct:a1', 'Olive（口座引落・振込）', true],
      ['acct:a2', '三井住友（口座引落・振込）', true],
    ])
    expect(methods[1]).toMatchObject({ kind: 'debit', accountId: 'a1' })
    expect(methods[1].order).toBeGreaterThan(card.order)
    expect(isAccountMethodId('acct:a1')).toBe(true)
    expect(isAccountMethodId('m-1')).toBe(false)
  })

  it('出金した日に、その口座から出る。残高が足りなければ不足になる', () => {
    const txs = [tx('1', '2026-10-30', 80000, 'a1')] // Olive 口座は残高 50,000
    const flows = outflows('2026-10-27', methods, txs, [], [])
    expect(flows.map((f) => [f.paymentDate, f.amount, accountOfOutflow(f, accounts)?.id])).toEqual([['2026-10-30', 80000, 'a1']])
    const cf = cashflowFor(cycle, [], [], flows, settings)
    const [carry] = projectAccounts([cf], accounts, settings)!
    expect(carry.accounts[0].shortage).toMatchObject({ date: '2026-10-30', balance: -30000 })
    expect(carry.accounts[0].shortages[0].label).toBe('Olive（口座引落・振込）での支払い')
    expect(carry.accounts[1].shortage).toBeNull() // 三井住友には影響しない
  })

  it('予算に反映される: 単発の出金は「使った額」、固定費の種類なら固定費に入る', () => {
    const run = (txs: Transaction[]) =>
      summarize(cycle, '2026-10-27', [member], [], [], txs, settings, incomeCycle, [], methods)
    expect(run([]).remaining).toBe(300000)
    const spent = run([tx('1', '2026-10-30', 10000, 'a1', { category: '食費' })])
    expect(spent.spent).toBe(10000)
    expect(spent.remaining).toBe(290000)
    const fixed = run([tx('2', '2026-10-30', 85000, 'a1')])
    expect(fixed.spent).toBe(0)
    expect(fixed.fixedTotal).toBe(85000)
    expect(fixed.remaining).toBe(215000)
  })

  it('固定費の実額として登録すると、見込み額の代わりにこの金額で数える（二重にならない）', () => {
    const rent: FixedCost = { id: 'f1', name: '家賃', amount: 85000, day: 27, methodId: 'c' }
    const withRent = (txs: Transaction[]) =>
      summarize(cycle, '2026-10-27', [member], [], [rent], txs, settings, incomeCycle, [], methods)
    expect(withRent([]).fixedTotal).toBe(85000) // 見込み額
    // 実額 83,000 を、固定費に紐付けて登録 → 見込み 85,000 の代わりに 83,000
    expect(withRent([tx('1', '2026-10-27', 83000, 'a1', { fixedCostId: 'f1' })]).fixedTotal).toBe(83000)
    // 紐付けずに登録すると、見込みに上乗せされて二重になる（だから登録画面で固定費を選べるようにしている）
    expect(withRent([tx('2', '2026-10-27', 83000, 'a1')]).fixedTotal).toBe(168000)
  })

  it('口座を削除したあとも、支出の記録は残る（支払い方法は「削除済み」扱い）', () => {
    const left = withAccountMethods([card], [accounts[1]])
    expect(left.some((m) => m.id === 'acct:a1')).toBe(false)
  })
})
