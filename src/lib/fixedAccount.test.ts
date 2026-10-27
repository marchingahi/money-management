import { describe, expect, it } from 'vitest'
import { accountOfOutflow, committedBillings, cycleEvents, cashflowFor, outflowKey, outflows, shortageKind, summarize } from './budget'
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

describe('残高不足の種類', () => {
  const carry = (balances: [number, number][]) =>
    ({
      accounts: balances.map(([closing, min], i) => ({
        account: { id: `x${i}`, name: `口座${i}`, order: i },
        fromInput: true,
        opening: 0,
        closing,
        shortage: min < 0 ? { date: '2026-10-26', balance: min, label: '引落' } : null,
        shortages: min < 0 ? [{ date: '2026-10-26', balance: min, label: '引落' }] : [],
      })),
      opening: 0,
      closing: balances.reduce((s, [c]) => s + c, 0),
    }) as unknown as Parameters<typeof shortageKind>[0]

  it('不足がなければ null', () => {
    expect(shortageKind(carry([[1000, 1000], [2000, 2000]]))).toBeNull()
  })

  it('ほかの口座に余裕があれば、振替で補える', () => {
    expect(shortageKind(carry([[-30000, -30000], [500000, 500000]]))).toBe('transfer')
  })

  it('ほかの口座を合わせても足りなければ、入金が必要', () => {
    expect(shortageKind(carry([[-30000, -30000], [20000, 20000]]))).toBe('insufficient')
  })

  it('口座が 1 つだけなら、入金が必要', () => {
    expect(shortageKind(carry([[-30000, -30000]]))).toBe('insufficient')
  })

  it('最も不足する時点の額で比べる（最後に戻っていても、途中の不足を補う必要がある）', () => {
    // 口座 0 は終了時 −1,000 でも途中で −60,000 まで下がる。口座 1 の余裕は 50,000
    expect(shortageKind(carry([[-1000, -60000], [50000, 50000]]))).toBe('insufficient')
    expect(shortageKind(carry([[-1000, -60000], [70000, 70000]]))).toBe('transfer')
  })
})

describe('引落先の口座', () => {
  const accts: Account[] = [
    { id: 'a1', name: 'Olive', order: 1 },
    { id: 'a2', name: '三井住友', order: 2 },
  ]
  const wallet: PaymentMethod = { id: 'w', name: '財布の現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 3, accountId: 'none' }
  const bank: PaymentMethod = { id: 'b', name: '口座引落', kind: 'debit', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 4, accountId: 'a2' }
  const unset: PaymentMethod = { id: 'u', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 5 }
  const out = (m: PaymentMethod, accountId?: string) =>
    ({ method: m, paymentDate: '2026-11-01', closingDate: '2026-11-01', amount: 1, confirmed: true, includesEstimate: false, ...(accountId && { accountId }) })

  it('支払い方法の口座、固定費で指定した口座、未指定は最初の口座。口座を使わない現金は口座なし', () => {
    expect(accountOfOutflow(out(card), accts)?.name).toBe('Olive') // カードに口座の指定なし → 最初の口座
    expect(accountOfOutflow(out(bank), accts)?.name).toBe('三井住友')
    expect(accountOfOutflow(out(unset), accts)?.name).toBe('Olive')
    expect(accountOfOutflow(out(wallet), accts)).toBeUndefined()
    // 固定費で口座を指定すれば、口座を使わない現金でもその口座から出る
    expect(accountOfOutflow(out(wallet, 'a2'), accts)?.name).toBe('三井住友')
    expect(accountOfOutflow(out(card), [])).toBeUndefined()
  })
})

describe('確定済みの引落（実質あと使える額）', () => {
  const olive: PaymentMethod = { id: 'o', name: 'Olive', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 1 }
  const saison: PaymentMethod = { id: 's', name: 'セゾン', kind: 'credit', closingDay: 10, paymentDay: 4, monthOffset: 1, order: 2 }
  const cash: PaymentMethod = { id: 'k', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 3 }
  const methods = [olive, saison, cash]
  const cycle = cycleOf('2026-10-27', { startDay: 25, businessDay: true }) // 10/23〜11/24
  const incomeCycle = cycleOf('2026-11-27', { startDay: 25, businessDay: true }) // 11/25〜12/24
  const tx = (id: string, date: string, amount: number, methodId: string, extra: Partial<import('./types').Transaction> = {}) =>
    ({ id, date, amount, category: '食費', methodId, memo: '', ...extra })

  it('今サイクルより前の利用で、次の給料の期間に引き落とされるクレジットだけを数える', () => {
    const txs = [
      tx('1', '2026-10-10', 12724, 'o'), // 10/31 締め → 11/26 引落 ✓
      tx('2', '2026-10-05', 3000, 'o'), // 同じ 11/26 引落 → 1 つにまとめる
      tx('3', '2026-10-25', 5000, 'o'), // 今サイクルの利用 → 使った額に入っているので数えない
      tx('4', '2026-09-10', 9000, 'o'), // 9/30 締め → 10/26 引落 → 次の給料の期間ではない
      tx('5', '2026-10-12', 777, 'k'), // 現金は利用日に出ている
      tx('6', '2026-10-10', 4000, 'o', { plannedId: 'p' }), // 予定の出費の支払いは確保済みのお金から払う
      tx('7', '2026-10-20', 20000, 's'), // 11/10 締め → 12/4 引落 ✓
    ]
    const c = committedBillings(txs, methods, cycle, incomeCycle)
    expect(c.map((x) => [x.method.name, x.paymentDate, x.amount])).toEqual([
      ['Olive', '2026-11-26', 15724],
      ['セゾン', '2026-12-04', 20000],
    ])
  })

  it('支払月を保存した支出は、その月の引落で数える', () => {
    // 計算では 11/26 引落のところ、支払月を 12 月に指定 → 12/28 引落（12/26 は土曜）で、次の給料の期間の外
    expect(committedBillings([tx('1', '2026-10-10', 1000, 'o', { paymentMonth: '2026-12' })], methods, cycle, incomeCycle)).toEqual([])
    // 計算では 10/26 引落（期間の外）のところ、支払月を 11 月に指定 → 11/26 引落で期間の中
    const c = committedBillings([tx('1', '2026-09-10', 1000, 'o', { paymentMonth: '2026-11' })], methods, cycle, incomeCycle)
    expect(c.map((x) => x.paymentDate)).toEqual(['2026-11-26'])
  })

  it('summarize: 実質あと使える額 = あと使える額 − 確定済みの引落', () => {
    const txs = [tx('1', '2026-10-10', 12724, 'o'), tx('2', '2026-10-25', 5000, 'o')]
    const m = [{ id: 'p', name: '自分', payday: 25, payType: 'monthly', takeHome: 300000, hourlyWage: 0, hoursPerDay: 0, daysPerMonth: 0, deductionRate: 0 }] as unknown as import('./types').Member[]
    const s = summarize(cycle, '2026-10-27', m, [], [], txs, { ...settings, savings: 0 }, incomeCycle, [], methods)
    expect(s.remaining).toBe(300000 - 5000 - 12724 + 12724) // 前の利用分は使った額に入らない
    expect(s.committedTotal).toBe(12724)
    expect(s.realRemaining).toBe(s.remaining - 12724)
    // 支払い方法を渡さなければ（取り込み前後の比較など）従来どおり
    expect(summarize(cycle, '2026-10-27', m, [], [], txs, { ...settings, savings: 0 }, incomeCycle).realRemaining).toBe(s.remaining)
  })
})
