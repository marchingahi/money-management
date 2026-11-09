import { describe, expect, it } from 'vitest'
import { bonusDate, bonusEstimatesFor, bonusKey, isBonusEstimate } from './bonus'
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
const accounts: Account[] = [
  { id: 'a1', name: '自分の口座', order: 1, balance: 100000, balanceDate: '2026-11-25' },
  { id: 'a2', name: '妻の口座', order: 2, balance: 50000, balanceDate: '2026-11-25' },
]
// 12/10 は木曜（営業日）。11/25〜12/24 のサイクル
const dec = cycleOf('2026-12-01', rule)

describe('賞与の入金日', () => {
  it('休業日なら前の営業日に前倒しする', () => {
    expect(bonusDate(2026, 12, 10)).toBe('2026-12-10') // 木曜
    expect(bonusDate(2026, 6, 30)).toBe('2026-06-30') // 火曜
    expect(bonusDate(2027, 12, 10)).toBe('2027-12-10') // 金曜
    expect(bonusDate(2026, 12, 12)).toBe('2026-12-11') // 土曜 → 金曜
    expect(bonusDate(2026, 11, 23)).toBe('2026-11-20') // 祝日の月曜 → 前の金曜
    expect(bonusDate(2027, 2, 31)).toBe('2027-02-26') // 末日（28 日は日曜）→ 前の営業日
  })
})

describe('賞与の見込み', () => {
  it('入金日が含まれるサイクルに、人ごとの見込み額が入る（入金先はその人の振込口座）', () => {
    const e = bonusEstimatesFor(dec, members, [])
    expect(e.map((x) => [x.memo, x.date, x.amount, x.accountId])).toEqual([
      ['自分の冬の賞与', '2026-12-10', 500000, 'a1'],
      ['妻の冬の賞与', '2026-12-10', 300000, 'a2'],
    ])
    expect(e.every(isBonusEstimate)).toBe(true)
  })

  it('入金日が別のサイクルなら入らない。年をまたぐサイクルでも、翌年の 1 月の賞与を拾う', () => {
    expect(bonusEstimatesFor(cycleOf('2026-10-27', rule), members, [])).toEqual([])
    const jan = mk('j', '自分', 'a1', [{ id: 'bj', name: '1月の賞与', month: 1, day: 10, amount: 100000 }])
    const e = bonusEstimatesFor(cycleOf('2026-12-30', rule), [jan], []) // 12/25〜1/24
    expect(e.map((x) => x.date)).toEqual(['2027-01-08']) // 1/10 は日曜 → 金曜
  })

  it('見込み額が 0 の賞与は数えない', () => {
    const zero = mk('z', '自分', 'a1', [{ id: 'bz', name: '賞与', month: 12, day: 10, amount: 0 }])
    expect(bonusEstimatesFor(dec, [zero], [])).toEqual([])
  })

  it('実額が入力済みなら、見込み額の代わりに実額で数える（二重にならない）', () => {
    const key = bonusKey('h', 'b1', 2026)
    const actual: ExtraIncome = { id: 'x1', bonusKey: key, date: '2026-12-10', amount: 480000, accountId: 'a1', memo: '自分の冬の賞与' }
    expect(bonusEstimatesFor(dec, members, [actual]).map((x) => x.memo)).toEqual(['妻の冬の賞与']) // 自分の分は見込みから外れる
    const cf = cashflowFor(dec, members, [], [], settings, [actual])
    expect(cf.extras.map((x) => [x.memo, x.amount])).toEqual([
      ['自分の冬の賞与', 480000], // 実額
      ['妻の冬の賞与', 300000], // 見込み
    ])
    expect(cf.extraTotal).toBe(780000)
  })
})

describe('賞与の反映先', () => {
  it('給料ごとの残りに加わり、入金先の口座の残高に入る', () => {
    const cf = cashflowFor(dec, members, [], [], settings)
    expect(cf.extraTotal).toBe(800000)
    const events = cycleEvents(cf, accounts, settings).filter((e) => e.key.startsWith('extra:'))
    expect(events.map((e) => [e.accountId, e.amount, e.label])).toEqual([
      ['a1', 500000, '自分の冬の賞与'],
      ['a2', 300000, '妻の冬の賞与'],
    ])
    // 残高を入れた 11/25 当日の給料は反映済み。賞与は 12/10 なので、各口座の残高に入る
    const [carry] = projectAccounts([cf], accounts, settings)!
    expect(carry.accounts.map((a) => [a.account.id, a.opening, a.closing])).toEqual([
      ['a1', 100000, 600000], // 自分: 100,000 + 賞与 500,000
      ['a2', 50000, 350000], // 妻: 50,000 + 賞与 300,000
    ])
  })

  it('予算（あと使える額）には、設定で選んだときだけ含める', () => {
    const run = (s: Settings) => summarize(dec, '2026-12-01', members, [], [], [], s, dec, [], [], [])
    const off = run(settings)
    expect(off.extraTotal).toBe(0)
    expect(off.remaining).toBe(600000) // 手取り 300,000 × 2 人。賞与は含まれない
    const on = run({ ...settings, bonusInBudget: true })
    expect(on.extraTotal).toBe(800000)
    expect(on.remaining).toBe(1400000)
    // 賞与ではない臨時収入は、設定にかかわらず予算に含まれる
    const plain: ExtraIncome = { id: 'p', date: '2026-12-05', amount: 10000, accountId: 'a1', memo: '' }
    expect(summarize(dec, '2026-12-01', members, [], [], [], settings, dec, [], [], [plain]).extraTotal).toBe(10000)
  })
})
