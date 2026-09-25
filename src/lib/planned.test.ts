import { describe, expect, it } from 'vitest'
import { outflows, summarize } from './budget'
import { cycleOf, shiftCycle } from './dates'
import { plannedStatuses } from './planned'
import type { PaymentMethod, Transaction } from './types'

const c0 = cycleOf('2026-09-25', 25) // 9/25〜10/24
const c1 = shiftCycle(c0, 1, 25) // 10/25〜11/24
const c2 = shiftCycle(c0, 2, 25) // 11/25〜12/24
const today = '2026-09-25'

const trip = { id: 'trip', name: '旅行', amount: 60000, date: '2026-12-10', methodId: 'm1', reserveFrom: '2026-09-25' }
const soon = { id: 'soon', name: '結婚式のご祝儀', amount: 30000, date: '2026-10-10', methodId: 'cash', reserveFrom: '2026-09-25' }

const status = (plan: typeof trip, cycle = c0, txs: Transaction[] = [], day = today) =>
  plannedStatuses([plan], txs, cycle, 25, day)[0]

describe('plannedStatuses', () => {
  it('予定日のサイクルの前まで、毎サイクル均等に確保する', () => {
    // 12/10 は 11/25〜12/24 のサイクル → 9/25・10/25 の2回で確保
    expect(status(trip)).toMatchObject({ reserveCycles: 2, thisCycleReserve: 30000, reservedBefore: 0, dueCharge: 0 })
    expect(status(trip, c1)).toMatchObject({ thisCycleReserve: 30000, reservedBefore: 30000 })
    // 予定日のサイクルでは確保済みのお金から払うので、予算からは引かない
    expect(status(trip, c2)).toMatchObject({ thisCycleReserve: 0, reservedBefore: 60000, dueCharge: 0, thisCycleTotal: 0 })
  })

  it('実際の額が予定と違えば、差額だけ予定日のサイクルで調整する', () => {
    const paid = [{ id: 't', date: '2026-12-10', amount: 65000, category: '娯楽', methodId: 'm1', memo: '', plannedId: 'trip' }]
    expect(status(trip, c2, paid)).toMatchObject({ paid: 65000, dueCharge: 5000 })
    const cheaper = [{ ...paid[0], amount: 52000 }]
    expect(status(trip, c2, cheaper).dueCharge).toBe(-8000)
  })

  it('確保する期間がない（今のサイクルが予定日）なら、その全額を今サイクルで引く', () => {
    expect(status(soon)).toMatchObject({ reserveCycles: 0, thisCycleReserve: 0, dueCharge: 30000, thisCycleTotal: 30000 })
  })

  it('割り切れない額は端数を後ろの回に寄せ、合計がちょうどになる', () => {
    const plan = { ...trip, amount: 10000, date: '2026-12-28' } // 12/25 のサイクル → 3回
    const shares = [c0, c1, c2].map((c) => status(plan, c).thisCycleReserve)
    expect(shares).toEqual([3333, 3333, 3334])
  })

  it('確保の開始日より前のサイクルでは確保しない', () => {
    expect(status({ ...trip, reserveFrom: '2026-10-25' })).toMatchObject({ reserveCycles: 1, thisCycleReserve: 0 })
  })

  it('予定日を過ぎても支払いの記録がなければ知らせる', () => {
    expect(status(soon, c0, [], '2026-10-11').overdue).toBe(true)
  })
})

describe('予算・引落への反映', () => {
  const member = { id: 'p', name: '自分', payday: 25, payType: 'monthly' as const, takeHome: 300000, hourlyWage: 0, hoursPerDay: 0, daysPerMonth: 0, deductionRate: 0 }
  const settings = { id: 'main' as const, cycleStartDay: 25, savings: 0 }

  it('確保額を予算から引き、予定の出費の支払いは普段の支出に数えない', () => {
    const txs = [
      { id: 'a', date: '2026-09-26', amount: 4000, category: '食費', methodId: 'm1', memo: '' },
      { id: 'b', date: '2026-10-10', amount: 30000, category: 'その他', methodId: 'cash', memo: '', plannedId: 'soon' },
    ]
    const s = summarize(c0, today, [member], [], [], txs, settings, c0, [trip, soon])
    expect(s.plannedTotal).toBe(30000 + 30000) // 旅行の確保 + ご祝儀（今サイクルが予定日）
    expect(s.budget).toBe(300000 - 60000)
    expect(s.spent).toBe(4000)
  })

  it('支払いの記録がない予定の出費は、予定日に出ていく見込みとして引落に含める', () => {
    const olive: PaymentMethod = { id: 'm1', name: 'Olive', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 1 }
    const flows = outflows(today, [olive], [], [], [], [trip])
    // 12/10 の利用 → 12/31 締め → 1/26 引落
    expect(flows).toEqual([expect.objectContaining({ paymentDate: '2027-01-26', amount: 60000, includesEstimate: true })])
    const paid = [{ id: 't', date: '2026-12-10', amount: 65000, category: '娯楽', methodId: 'm1', memo: '', plannedId: 'trip' }]
    expect(outflows(today, [olive], paid, [], [], [trip])).toEqual([
      expect.objectContaining({ amount: 65000, includesEstimate: false }),
    ])
  })
})
