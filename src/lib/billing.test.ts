import { describe, expect, it } from 'vitest'
import { billingOf } from './billing'
import { expectedTakeHome, summarize, upcomingBillings } from './budget'
import { cycleOf, dayWithinCycle, shiftCycle } from './dates'
import type { Member, PaymentMethod } from './types'

const card = (id: number, name: string, closingDay: number, paymentDay: number): PaymentMethod => ({
  id,
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
  const husband: Member = { ...base, id: 1, name: '夫', payType: 'monthly', takeHome: 250000 }
  // 1,200円 × 6時間 × 16日 × (1 − 10%) = 103,680
  const wife: Member = { ...base, id: 2, name: '妻', payType: 'hourly', hourlyWage: 1200, hoursPerDay: 6, daysPerMonth: 16, deductionRate: 10 }
  const members = [husband, wife]
  const fixedCosts = [
    { id: 1, name: '電気', amount: 10000, day: 5, methodId: 1 },
    { id: 2, name: '家賃', amount: 90000, day: 27, methodId: 99 },
  ]
  const txs = [
    { id: 1, date: '2026-09-26', amount: 5000, category: '食費', methodId: 1, memo: '' },
    { id: 2, date: '2026-10-05', amount: 12000, category: '固定費', methodId: 1, memo: '', fixedCostId: 1 },
    { id: 3, date: '2026-09-20', amount: 8000, category: '食費', methodId: 1, memo: '' }, // 前サイクル
  ]
  const settings = { id: 'main' as const, cycleStartDay: 25, savings: 50000 }

  it('時給の見込み手取り', () => {
    expect(expectedTakeHome(wife)).toBe(103680)
    expect(expectedTakeHome(husband)).toBe(250000)
  })

  it('世帯収入（実額優先）から固定費（実額優先）と貯金を引いて残額を出す', () => {
    const incomes = [
      { memberId: 1, cycleStart: '2026-09-25', amount: 262000 }, // 今サイクルの実額
      { memberId: 2, cycleStart: '2026-08-25', amount: 90000 }, // 前サイクル（無関係）
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
