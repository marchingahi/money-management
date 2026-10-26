import { describe, expect, it } from 'vitest'
import { cycleEvents, cashflowFor, outflowKey, outflows } from './budget'
import { cycleOf } from './dates'
import type { Account, FixedCost, PaymentMethod, Settings } from './types'

const card: PaymentMethod = { id: 'c', name: 'カード', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 1, accountId: 'a1' }
const accounts: Account[] = [
  { id: 'a1', name: '口座A', order: 1 },
  { id: 'a2', name: '口座B', order: 2 },
]
const settings = { id: 'main', cycleStartDay: 25, savings: 0 } as Settings
const fixed = (accountId?: string): FixedCost => ({ id: 'f', name: '家賃', amount: 50000, day: 1, methodId: 'c', ...(accountId && { accountId }) })

describe('固定費の引落口座', () => {
  const cycle = cycleOf('2026-10-10', 25)
  const run = (f: FixedCost) => {
    const flows = outflows('2026-10-10', [card], [], [f], [cycle])
    // 10月分の固定費は翌月 26 日に引き落とされるので、そのサイクルの収支を見る
    const cf = cashflowFor(cycleOf('2026-11-26', 25), [], [], flows, settings)
    return { flows, events: cycleEvents(cf, accounts, settings).filter((e) => e.amount < 0) }
  }

  it('口座を指定しなければ支払い方法の口座から引き落とす', () => {
    const { events } = run(fixed())
    expect(events.map((e) => e.accountId)).toEqual(['a1'])
  })

  it('固定費に口座を指定するとその口座から引き落とし、同じカードでも別の出金になる', () => {
    const { flows, events } = run(fixed('a2'))
    expect(flows[0].accountId).toBe('a2')
    expect(outflowKey(flows[0])).toContain('#a2')
    expect(events.map((e) => e.accountId)).toEqual(['a2'])
  })
})

describe('固定費の名前での案内', () => {
  const cashCard: PaymentMethod = { id: 'k', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 2 }
  const costs: FixedCost[] = [
    { id: 'f1', name: '住宅ローン(元金)', amount: 63000, day: 27, methodId: 'k', accountId: 'a2' },
    { id: 'f2', name: '住宅ローン(利息)', amount: 18829, day: 27, methodId: 'k', accountId: 'a2' },
    { id: 'f3', name: '駐輪場', amount: 400, day: 27, methodId: 'k' },
  ]
  const cycle = cycleOf('2026-10-27', 25)

  it('口座を指定した固定費は、同じ日・同じ口座でまとめて、固定費の名前で案内する', () => {
    const flows = outflows('2026-10-27', [cashCard], [], costs, [cycle])
    const cf = cashflowFor(cycle, [], [], flows, { ...settings, savings: 0 })
    const labels = cycleEvents(cf, accounts, { ...settings, savings: 0 }).map((e) => [e.accountId, e.amount, e.label])
    expect(labels).toEqual([
      // 口座を指定していない固定費は、従来どおり支払い方法の名前（同じ日は金額の小さい出金が先）
      ['a1', -400, '現金での支払い'],
      ['a2', -81829, '住宅ローン(元金)・住宅ローン(利息)の支払い'],
    ])
  })

  it('クレジットの固定費は、カード名に固定費の名前を添える', () => {
    const flows = outflows('2026-10-27', [card], [], [{ ...costs[0], methodId: 'c' }], [cycle])
    expect(outflowKey(flows[0])).toContain('#a2')
    const cf = cashflowFor(cycleOf(flows[0].paymentDate, 25), [], [], flows, { ...settings, savings: 0 })
    expect(cycleEvents(cf, accounts, { ...settings, savings: 0 }).map((e) => e.label)).toEqual(['カード 引落（住宅ローン(元金)）'])
  })
})
