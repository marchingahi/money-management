import { describe, expect, it } from 'vitest'
import { bonusDate, bonusEstimatesFor, bonusFundingStart, bonusKey, fundsCycle, isBonusEstimate } from './bonus'
import { cashflowFor, cycleEvents, projectAccounts, summarize } from './budget'
import { cycleOf } from './dates'
import type { Account, ExtraIncome, Member, Settings } from './types'

const settings = { id: 'main', cycleStartDay: 25, savings: 0 } as Settings
const rule = { startDay: 25, businessDay: true }
const mk = (id: string, name: string, accountId: string, bonuses: Member['bonuses']): Member =>
  ({ id, name, payday: 25, payType: 'monthly', takeHome: 300000, hourlyWage: 0, hoursPerDay: 0, daysPerMonth: 0, deductionRate: 0, accountId, bonuses }) as unknown as Member
const husband = mk('h', '自分', 'a1', [{ id: 'b1', name: '冬の賞与', month: 12, day: 10, amount: 500000 }])
const wife = mk('w', '妻', 'a2', [
  { id: 'b2', name: '夏の賞与', month: 6, day: 30, amount: 200000 },
  { id: 'b3', name: '冬の賞与', month: 12, day: 10, amount: 300000 },
])
const members = [husband, wife]
const accountsAt = (balanceDate: string): Account[] => [
  { id: 'a1', name: '自分の口座', order: 1, balance: 100000, balanceDate },
  { id: 'a2', name: '妻の口座', order: 2, balance: 50000, balanceDate },
]
// 12/10 の賞与は、11/25〜12/24 の期間に入金されるが、使えるのは次の給料日（12/25）から
const dec = cycleOf('2026-12-01', rule) // 11/25〜12/24
const jan = cycleOf('2026-12-30', rule) // 12/25〜1/24

describe('賞与の入金日', () => {
  it('休業日なら前の営業日に前倒しする', () => {
    expect(bonusDate(2026, 12, 10)).toBe('2026-12-10') // 木曜
    expect(bonusDate(2026, 6, 30)).toBe('2026-06-30') // 火曜
    expect(bonusDate(2026, 12, 12)).toBe('2026-12-11') // 土曜 → 金曜
    expect(bonusDate(2026, 11, 23)).toBe('2026-11-20') // 祝日の月曜 → 前の金曜
    expect(bonusDate(2027, 2, 31)).toBe('2027-02-26') // 末日（28 日は日曜）→ 前の営業日
  })
})

describe('賞与が収入になるサイクル（入金後に最初に来る給料日から）', () => {
  it('給料日までに入った賞与は、その給料日から始まるサイクルの収入になる', () => {
    expect(bonusFundingStart('2026-12-10', rule)).toBe('2026-12-25') // 11/25〜12/24 の途中 → 12/25 から
    expect(bonusFundingStart('2026-12-24', rule)).toBe('2026-12-25') // 給料日の前日
    expect(bonusFundingStart('2026-12-25', rule)).toBe('2026-12-25') // 給料日当日は、その日から始まるサイクル
    expect(bonusFundingStart('2026-11-25', rule)).toBe('2026-11-25')
    expect(bonusFundingStart('2026-12-26', rule)).toBe('2027-01-25') // 給料日の翌日 → 次の給料日から
  })

  it('入金されたサイクルではなく、次のサイクルの収入になる', () => {
    expect(fundsCycle('2026-12-10', dec, rule)).toBe(false)
    expect(fundsCycle('2026-12-10', jan, rule)).toBe(true)
  })
})

describe('賞与の見込み', () => {
  it('次のサイクルに、人ごとの見込み額が入る（入金先はその人の振込口座）。入金日のサイクルには入らない', () => {
    expect(bonusEstimatesFor(dec, members, [], rule)).toEqual([])
    const e = bonusEstimatesFor(jan, members, [], rule)
    expect(e.map((x) => [x.memo, x.date, x.amount, x.accountId])).toEqual([
      ['自分の冬の賞与', '2026-12-10', 500000, 'a1'],
      ['妻の冬の賞与', '2026-12-10', 300000, 'a2'],
    ])
    expect(e.every(isBonusEstimate)).toBe(true)
  })

  it('年をまたぐサイクルでも、翌年の 1 月の賞与を拾う', () => {
    const j = mk('j', '自分', 'a1', [{ id: 'bj', name: '1月の賞与', month: 1, day: 10, amount: 100000 }])
    // 1/10 は日曜 → 1/8（金）に入金。次の給料日は 1/25 → 1/25〜2/24 のサイクル
    expect(bonusEstimatesFor(cycleOf('2027-02-01', rule), [j], [], rule).map((x) => x.date)).toEqual(['2027-01-08'])
    expect(bonusEstimatesFor(jan, [j], [], rule)).toEqual([])
  })

  it('見込み額が 0 の賞与は数えない', () => {
    const zero = mk('z', '自分', 'a1', [{ id: 'bz', name: '賞与', month: 12, day: 10, amount: 0 }])
    expect(bonusEstimatesFor(jan, [zero], [], rule)).toEqual([])
  })

  it('実額が入力済みなら、見込み額の代わりに実額で数える（二重にならない）', () => {
    const key = bonusKey('h', 'b1', 2026)
    const actual: ExtraIncome = { id: 'x1', bonusKey: key, date: '2026-12-10', amount: 480000, accountId: 'a1', memo: '自分の冬の賞与' }
    expect(bonusEstimatesFor(jan, members, [actual], rule).map((x) => x.memo)).toEqual(['妻の冬の賞与']) // 自分の分は見込みから外れる
    const cf = cashflowFor(jan, members, [], [], settings, [actual])
    expect(cf.extras.map((x) => [x.memo, x.amount])).toEqual([
      ['自分の冬の賞与', 480000], // 実額
      ['妻の冬の賞与', 300000], // 見込み
    ])
    expect(cf.extraTotal).toBe(780000)
    // 実額の入金日が給料日より後なら、次のサイクルの収入になる
    const later: ExtraIncome = { ...actual, date: '2026-12-26' }
    expect(cashflowFor(jan, members, [], [], settings, [later]).extras.map((x) => x.memo)).toEqual(['妻の冬の賞与'])
    expect(cashflowFor(cycleOf('2027-01-30', rule), members, [], [], settings, [later]).extras.map((x) => [x.memo, x.amount])).toEqual([['自分の冬の賞与', 480000]])
  })
})

describe('賞与の反映先', () => {
  it('入金日のサイクルの給料ごとの残りには入らず、次のサイクルの給料ごとの残りに入る', () => {
    expect(cashflowFor(dec, members, [], [], settings).extraTotal).toBe(0)
    expect(cashflowFor(jan, members, [], [], settings).extraTotal).toBe(800000)
  })

  it('口座には次のサイクルの開始日の入金として入る。実際の入金日は残高に反映済みかの判定に使う', () => {
    const cf = cashflowFor(jan, members, [], [], settings)
    const events = cycleEvents(cf, accountsAt('2026-11-25'), settings).filter((e) => e.key.startsWith('extra:'))
    expect(events.map((e) => [e.accountId, e.date, e.settleDate, e.amount, e.label])).toEqual([
      ['a1', '2026-12-25', '2026-12-10', 500000, '自分の冬の賞与'],
      ['a2', '2026-12-25', '2026-12-10', 300000, '妻の冬の賞与'],
    ])
    // 残高を 11/25 に入れた → 12/10 の入金はまだ残高に含まれていない → 12/25 の収入として加わる
    // （12/25 の期間の入金: 給料 300,000 + 賞与。自分 500,000、妻 300,000）
    const [carry] = projectAccounts([cf], accountsAt('2026-11-25'), settings)!
    expect(carry.accounts.map((a) => [a.account.id, a.opening, a.closing])).toEqual([
      ['a1', 100000, 100000 + 300000 + 500000],
      ['a2', 50000, 50000 + 300000 + 300000],
    ])
  })

  it('残高を入金後に入力していれば、残高にすでに含まれているので、二重に加えない', () => {
    // 残高を 12/15 に入れた → 12/10 の賞与は入金済みで残高に入っている（加わるのは 12/25 の給料だけ）
    const cf = cashflowFor(jan, members, [], [], settings)
    const [carry] = projectAccounts([cf], accountsAt('2026-12-15'), settings)!
    expect(carry.accounts.map((a) => [a.account.id, a.opening, a.closing])).toEqual([
      ['a1', 100000, 100000 + 300000],
      ['a2', 50000, 50000 + 300000],
    ])
  })

  it('予算（あと使える額）には、設定で選んだときだけ、収入になるサイクルに含める', () => {
    const run = (cycle: typeof jan, s: Settings) => summarize(cycle, '2026-12-30', members, [], [], [], s, cycle, [], [], [])
    expect(run(jan, settings).extraTotal).toBe(0)
    expect(run(jan, settings).remaining).toBe(600000) // 手取り 300,000 × 2 人。賞与は含まれない
    expect(run(jan, { ...settings, bonusInBudget: true }).extraTotal).toBe(800000)
    expect(run(jan, { ...settings, bonusInBudget: true }).remaining).toBe(1400000)
    // 入金日のサイクルの予算には、設定にかかわらず入らない
    expect(run(dec, { ...settings, bonusInBudget: true }).extraTotal).toBe(0)
    // 賞与ではない臨時収入は、設定にかかわらず、入金日のサイクルの予算に含まれる
    const plain: ExtraIncome = { id: 'p', date: '2026-12-05', amount: 10000, accountId: 'a1', memo: '' }
    expect(summarize(dec, '2026-12-01', members, [], [], [], settings, dec, [], [], [plain]).extraTotal).toBe(10000)
  })
})
