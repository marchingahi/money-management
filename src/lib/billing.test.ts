import { describe, expect, it } from 'vitest'
import { billingOf } from './billing'
import { cashflowFor, expectedTakeHome, NO_ACCOUNT, outflows, projectAccounts, summarize, upcomingBillings } from './budget'
import { cycleOf, dayWithinCycle, shiftCycle } from './dates'
import type { Account, Member, PaymentMethod } from './types'

const card = (id: number, name: string, closingDay: number, paymentDay: number): PaymentMethod => ({
  id: String(id),
  name,
  kind: 'credit',
  closingDay,
  paymentDay,
  monthOffset: 1,
  order: id,
})

const olive = card(1, 'Olive', 31, 26)
const paypay = card(2, 'PayPay', 31, 27)
const saison = card(3, 'セゾン', 10, 4)
const jal = card(4, 'JAL', 15, 10)
const epos = card(6, 'エポス', 4, 4)
const aeon = card(8, 'イオン', 10, 2)

describe('billingOf', () => {
  it('月末締め翌26日払い', () => {
    expect(billingOf('2026-09-20', olive)).toEqual({ closingDate: '2026-09-30', paymentDate: '2026-10-26' })
  })

  it('締め日当日の利用はその締めに含まれる', () => {
    expect(billingOf('2026-09-30', paypay)).toEqual({ closingDate: '2026-09-30', paymentDate: '2026-10-27' })
    expect(billingOf('2026-09-10', saison).closingDate).toBe('2026-09-10')
  })

  it('締め日翌日の利用は翌月の締めに回る', () => {
    expect(billingOf('2026-09-11', saison)).toEqual({ closingDate: '2026-10-10', paymentDate: '2026-11-04' })
    expect(billingOf('2026-09-05', epos)).toEqual({ closingDate: '2026-10-04', paymentDate: '2026-11-04' })
  })

  it('引落日が日曜なら翌営業日', () => {
    expect(billingOf('2026-09-10', saison).paymentDate).toBe('2026-10-05')
    expect(billingOf('2026-09-04', epos).paymentDate).toBe('2026-10-05')
  })

  it('土曜→月曜が祝日（スポーツの日）なら火曜', () => {
    expect(billingOf('2026-08-20', jal)).toEqual({ closingDate: '2026-09-15', paymentDate: '2026-10-13' })
  })

  it('年末年始（1/2〜1/3）は銀行休業日として翌営業日', () => {
    expect(billingOf('2026-11-15', aeon)).toEqual({ closingDate: '2026-12-10', paymentDate: '2027-01-04' })
  })

  it('月末締めは2月だと28日', () => {
    expect(billingOf('2027-02-15', olive).closingDate).toBe('2027-02-28')
  })

  it('クレジット以外は利用日に出ていく', () => {
    const cash: PaymentMethod = { ...olive, kind: 'cash' }
    expect(billingOf('2026-09-20', cash)).toEqual({ closingDate: '2026-09-20', paymentDate: '2026-09-20' })
  })
})

describe('cycle', () => {
  it('給料日25日のサイクル', () => {
    expect(cycleOf('2026-09-25', 25)).toEqual({ start: '2026-09-25', end: '2026-10-24' })
    expect(cycleOf('2026-09-24', 25)).toEqual({ start: '2026-08-25', end: '2026-09-24' })
    expect(cycleOf('2027-01-10', 25)).toEqual({ start: '2026-12-25', end: '2027-01-24' })
  })

  it('月末開始は月の長さに合わせる', () => {
    expect(cycleOf('2027-02-28', 31)).toEqual({ start: '2027-02-28', end: '2027-03-30' })
  })

  it('shiftCycle / dayWithinCycle', () => {
    const c = cycleOf('2026-09-25', 25)
    expect(shiftCycle(c, 1, 25)).toEqual({ start: '2026-10-25', end: '2026-11-24' })
    expect(dayWithinCycle(c, 27)).toBe('2026-09-27')
    expect(dayWithinCycle(c, 5)).toBe('2026-10-05')
  })
})

describe('summarize', () => {
  const cycle = cycleOf('2026-09-25', 25)
  const base = { payday: 25, takeHome: 0, hourlyWage: 0, hoursPerDay: 0, daysPerMonth: 0, deductionRate: 0 }
  const husband: Member = { ...base, id: '1', name: '夫', payType: 'monthly', takeHome: 250000 }
  // 1,200円 × 6時間 × 16日 × (1 − 10%) = 103,680
  const wife: Member = { ...base, id: '2', name: '妻', payType: 'hourly', hourlyWage: 1200, hoursPerDay: 6, daysPerMonth: 16, deductionRate: 10 }
  const members = [husband, wife]
  const fixedCosts = [
    { id: '1', name: '電気', amount: 10000, day: 5, methodId: '1' },
    { id: '2', name: '家賃', amount: 90000, day: 27, methodId: '99' },
  ]
  const txs = [
    { id: '1', date: '2026-09-26', amount: 5000, category: '食費', methodId: '1', memo: '' },
    { id: '2', date: '2026-10-05', amount: 12000, category: '固定費', methodId: '1', memo: '', fixedCostId: '1' },
    { id: '3', date: '2026-09-20', amount: 8000, category: '食費', methodId: '1', memo: '' }, // 前サイクル
  ]
  const settings = { id: 'main' as const, cycleStartDay: 25, savings: 50000 }

  it('時給の見込み手取り', () => {
    expect(expectedTakeHome(wife)).toBe(103680)
    expect(expectedTakeHome(husband)).toBe(250000)
  })

  it('世帯収入（実額優先）から固定費（実額優先）と貯金を引いて残額を出す', () => {
    const incomes = [
      { memberId: '1', cycleStart: '2026-09-25', amount: 262000 }, // 今サイクルの実額
      { memberId: '2', cycleStart: '2026-08-25', amount: 90000 }, // 前サイクル（無関係）
    ]
    const s = summarize(cycle, '2026-10-15', members, incomes, fixedCosts, txs, settings)
    expect(s.incomes.map((i) => [i.amount, i.actual])).toEqual([
      [262000, 262000],
      [103680, undefined],
    ])
    expect(s.income).toBe(365680)
    expect(s.fixedTotal).toBe(12000 + 90000)
    expect(s.budget).toBe(365680 - 102000 - 50000)
    expect(s.spent).toBe(5000)
    expect(s.remaining).toBe(213680 - 5000)
    expect(s.daysLeft).toBe(10)
    expect(s.perDay).toBe(20868)
  })

  it('cashflowFor: 給料からそのサイクル中の引落・現金支出・貯金を引く', () => {
    const cash: PaymentMethod = { id: '9', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 9 }
    const methods = [olive, saison, cash]
    const txs = [
      { id: '1', date: '2026-08-20', amount: 30000, category: '食費', methodId: '1', memo: '' }, // 8/31締め 9/28 引落 → 9/25 サイクル（今日の給料から払う）
      { id: '2', date: '2026-09-26', amount: 5000, category: '食費', methodId: '1', memo: '' }, // 10/26 引落 → 10/25 サイクル
      { id: '3', date: '2026-09-05', amount: 7000, category: '食費', methodId: '3', memo: '' }, // 9/10締め 10/5 引落 → 9/25 サイクル
      { id: '4', date: '2026-09-30', amount: 2000, category: '食費', methodId: '9', memo: '' }, // 現金 → 9/25 サイクル
      { id: '5', date: '2026-10-01', amount: 4000, category: '固定費', methodId: '1', memo: '', paymentMonth: '2026-12' },
    ]
    const flows = outflows('2026-09-25', methods, txs, [], [])
    const cur = cashflowFor(cycle, members, [], flows, settings)
    expect(cur.income).toBe(353680)
    expect(cur.cards.map((c) => [c.method.name, c.paymentDate, c.amount, c.confirmed])).toEqual([
      ['Olive', '2026-09-28', 30000, true],
      ['セゾン', '2026-10-05', 7000, true],
    ])
    expect(cur.direct.map((d) => [d.method.name, d.amount])).toEqual([['現金', 2000]])
    expect(cur.remaining).toBe(353680 - 39000 - 50000)
    expect(cur.open).toBe(false)

    const next = cashflowFor(shiftCycle(cycle, 1, 25), members, [], flows, settings)
    expect(next.cards.map((c) => [c.paymentDate, c.amount, c.confirmed])).toEqual([['2026-10-26', 5000, false]])
    expect(next.open).toBe(true)

    // 引落月指定（Excel の支払月）12 月 → 12/28 引落 → 12/25 サイクル
    const after = cashflowFor(shiftCycle(cycle, 3, 25), members, [], flows, settings)
    expect(after.cards.map((c) => [c.paymentDate, c.amount])).toEqual([['2026-12-28', 4000]])
  })

  it('projectAccounts: 口座ごとに繰越を計算し、当日の未反映指定と残高不足を扱う', () => {
    const cash: PaymentMethod = { id: '9', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 9, accountId: NO_ACCOUNT }
    const methods = [{ ...olive, accountId: 'A' }, { ...saison, accountId: 'B' }, cash]
    const people = [
      { ...husband, accountId: 'A' },
      { ...wife, accountId: 'B' },
    ]
    const txs = [
      { id: '1', date: '2026-08-20', amount: 30000, category: '食費', methodId: '1', memo: '' }, // A: 9/28 引落
      { id: '2', date: '2026-09-26', amount: 5000, category: '食費', methodId: '1', memo: '' }, // A: 10/26 引落
      { id: '3', date: '2026-09-05', amount: 7000, category: '食費', methodId: '3', memo: '' }, // B: 10/5 引落
      { id: '4', date: '2026-09-27', amount: 1000, category: '食費', methodId: '9', memo: '' }, // 財布の現金 → 口座に影響しない
    ]
    const s = { ...settings, savingsAccountId: 'A' }
    const accounts: Account[] = [
      // 9/25 に残高を入れたが、自分の給料はまだ振り込まれていない
      { id: 'A', name: '三井住友', order: 1, balance: 50000, balanceDate: '2026-09-25', unsettled: ['income:1@2026-09-25'] },
      { id: 'B', name: '楽天', order: 2, balance: 5000, balanceDate: '2026-09-25' },
    ]
    const flows = outflows('2026-09-25', methods, txs, [], [])
    const cfs = [0, 1].map((n) => cashflowFor(shiftCycle(cycle, n, 25), people, [], flows, s))
    const [cur, next] = projectAccounts(cfs, accounts, s)!

    // A: 50,000 + 未反映の給料 250,000 − 9/28 引落 30,000（貯金は当日反映済み）
    expect(cur.accounts[0]).toMatchObject({ fromInput: true, opening: 50000, closing: 270000, shortage: null })
    // B: 5,000 − 10/5 引落 7,000 → 不足
    expect(cur.accounts[1]).toMatchObject({
      closing: -2000,
      shortage: { date: '2026-10-05', balance: -2000, label: 'セゾン 引落' },
    })
    expect(cur.closing).toBe(268000)

    // 次の給料: A = 270,000 + 250,000 − 貯金 50,000 − 10/26 引落 5,000、B = −2,000 + 103,680
    expect(next.accounts.map((a) => [a.fromInput, a.opening, a.closing])).toEqual([
      [false, 270000, 465000],
      [false, -2000, 101680],
    ])
  })

  it('projectAccounts: 口座間の振替で不足を補える（家計全体の残りは変わらない）', () => {
    const methods = [{ ...olive, accountId: 'A' }, { ...saison, accountId: 'B' }]
    const people = [
      { ...husband, accountId: 'A' },
      { ...wife, accountId: 'B' },
    ]
    const txs = [{ id: '3', date: '2026-09-05', amount: 7000, category: '食費', methodId: '3', memo: '' }] // B: 10/5 引落
    const accounts: Account[] = [
      { id: 'A', name: '三井住友', order: 1, balance: 50000, balanceDate: '2026-09-25' },
      { id: 'B', name: '楽天', order: 2, balance: 5000, balanceDate: '2026-09-25' },
    ]
    const flows = outflows('2026-09-25', methods, txs, [], [])
    const cf = cashflowFor(cycle, people, [], flows, settings)
    const before = projectAccounts([cf], accounts, settings)![0]
    expect(before.accounts[1].shortage).toMatchObject({ date: '2026-10-05', balance: -2000 })

    // 引落と同じ日に振り替えても、入金を先に数えるので不足にならない
    const transfers = [{ id: 't1', date: '2026-10-05', amount: 3000, fromAccountId: 'A', toAccountId: 'B', memo: '' }]
    const [after] = projectAccounts([cf], accounts, settings, transfers)!
    expect(after.accounts.map((a) => [a.closing, a.shortage])).toEqual([
      [47000, null],
      [1000, null],
    ])
    expect(after.closing).toBe(before.closing)
    // サイクル外の振替や、登録されていない口座への振替は無視
    const ignored = [
      { id: 't2', date: '2026-11-01', amount: 3000, fromAccountId: 'A', toAccountId: 'B', memo: '' },
      { id: 't3', date: '2026-10-01', amount: 3000, fromAccountId: 'A', toAccountId: 'X', memo: '' },
    ]
    expect(projectAccounts([cf], accounts, settings, ignored)![0].accounts[1].closing).toBe(-2000)
  })

  it('projectAccounts: 残高を入れた口座がなければ null', () => {
    const cf = cashflowFor(cycle, members, [], [], settings)
    expect(projectAccounts([cf], [{ id: 'A', name: 'x', order: 1 }], settings)).toBeNull()
  })

  it('upcomingBillings はカード×引落日で合算し、未入力の固定費を見込みで含める', () => {
    const methods = [olive, { ...card(99, '口座振替', 1, 1), kind: 'debit' as const }]
    const onlyVariable = txs.filter((t) => t.fixedCostId == null)
    const list = upcomingBillings('2026-09-25', methods, onlyVariable, fixedCosts, [cycle])
    expect(list).toEqual([
      expect.objectContaining({ paymentDate: '2026-10-26', amount: 8000 + 5000, confirmed: false, includesEstimate: false }),
      expect.objectContaining({ paymentDate: '2026-11-26', amount: 10000, includesEstimate: true }),
    ])
  })
})
