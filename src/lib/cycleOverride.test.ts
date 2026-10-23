import { describe, expect, it } from 'vitest'
import { cycleOf, shiftCycle } from './dates'
import { incomeDate, incomeStatuses } from './budget'
import type { Income, Member } from './types'

const rule = { startDay: 25, overrides: { '2026-10': 23 } }

describe('月ごとのサイクル開始日の上書き', () => {
  it('上書きした月に始まるサイクルは、その開始日から始まり、前のサイクルはその前日で終わる', () => {
    expect(cycleOf('2026-10-23', rule)).toEqual({ start: '2026-10-23', end: '2026-11-24' })
    expect(cycleOf('2026-10-22', rule)).toEqual({ start: '2026-09-25', end: '2026-10-22' })
    expect(cycleOf('2026-10-24', rule)).toEqual({ start: '2026-10-23', end: '2026-11-24' })
  })

  it('上書きしていない月は従来どおり', () => {
    expect(cycleOf('2026-11-25', rule)).toEqual({ start: '2026-11-25', end: '2026-12-24' })
    expect(cycleOf('2026-09-25', 25)).toEqual({ start: '2026-09-25', end: '2026-10-24' })
  })

  it('shiftCycle も上書きに従う', () => {
    const sep = cycleOf('2026-09-30', rule)
    expect(shiftCycle(sep, 1, rule).start).toBe('2026-10-23')
    expect(shiftCycle(shiftCycle(sep, 1, rule), 1, rule).start).toBe('2026-11-25')
    expect(shiftCycle(cycleOf('2026-11-30', rule), -1, rule).start).toBe('2026-10-23')
  })

  it('月末日の指定でも、すべての日がちょうど1つのサイクルに入る', () => {
    const r = { startDay: 31, overrides: { '2026-04': 28 } }
    let prevEnd = cycleOf('2026-03-01', r).end
    for (let d = new Date(2026, 2, 1); d < new Date(2026, 7, 1); d.setDate(d.getDate() + 1)) {
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const c = cycleOf(ymd, r)
      expect(c.start <= ymd && ymd <= c.end).toBe(true)
      if (c.end !== prevEnd) {
        const next = new Date(prevEnd)
        next.setDate(next.getDate() + 1)
        expect(c.start).toBe(next.toISOString().slice(0, 10))
        prevEnd = c.end
      }
    }
  })

  it('給料日がサイクル開始日と同じ人の入金日は、ずれた開始日になる', () => {
    const member = { id: 'm', name: '自分', payday: 25 } as Member
    const other = { id: 'o', name: '妻', payday: 10 } as Member
    const oct = cycleOf('2026-10-23', rule)
    expect(incomeDate(oct, member, 25)).toBe('2026-10-23')
    expect(incomeDate(oct, other, 25)).toBe('2026-11-10')
  })

  it('入力済みの手取りは、開始日が変わっても同じ月のサイクルに紐付く', () => {
    const member = { id: 'm', name: '自分', payday: 25, payType: 'monthly', takeHome: 100 } as Member
    const incomes = [{ id: 'i', memberId: 'm', cycleStart: '2026-10-25', amount: 300 }] as Income[]
    const [s] = incomeStatuses([member], incomes, cycleOf('2026-10-23', rule))
    expect(s.actual).toBe(300)
  })
})

describe('開始日が休業日なら前の営業日にする', () => {
  const biz = { startDay: 25, businessDay: true }

  it('日曜は金曜に、平日はそのまま', () => {
    // 2026-10-25 は日曜
    expect(cycleOf('2026-10-23', biz)).toEqual({ start: '2026-10-23', end: '2026-11-24' })
    expect(cycleOf('2026-10-22', biz).end).toBe('2026-10-22')
    // 2026-11-25 は水曜
    expect(cycleOf('2026-11-25', biz).start).toBe('2026-11-25')
  })

  it('祝日は前の営業日まで戻る（2026-11-23 は祝日の月曜 → 20日の金曜）', () => {
    expect(cycleOf('2026-11-20', { startDay: 23, businessDay: true }).start).toBe('2026-11-20')
  })

  it('調整しない指定（数値・businessDay なし）は従来どおり', () => {
    expect(cycleOf('2026-10-23', 25).start).toBe('2026-09-25')
    expect(cycleOf('2026-10-23', { startDay: 25 }).start).toBe('2026-09-25')
  })

  it('月ごとの個別指定は営業日調整をしない', () => {
    // 2026-10 を 25 日（日曜）に個別指定したら、そのまま 25 日
    expect(cycleOf('2026-10-25', { ...biz, overrides: { '2026-10': 25 } }).start).toBe('2026-10-25')
    expect(cycleOf('2026-10-24', { ...biz, overrides: { '2026-10': 25 } }).start).toBe('2026-09-25')
  })

  it('shiftCycle で何か月進めても、サイクルは隙間も重なりもなくつながる', () => {
    let c = cycleOf('2026-01-10', biz)
    for (let i = 0; i < 24; i++) {
      const n = shiftCycle(c, 1, biz)
      const next = new Date(c.end)
      next.setDate(next.getDate() + 1)
      expect(n.start).toBe(next.toISOString().slice(0, 10))
      c = n
    }
  })

  it('1 日開始で年始に前の年へずれ込んでも、全日がちょうど 1 つのサイクルに入る', () => {
    const r = { startDay: 1, businessDay: true }
    // 2027-01-01 は金曜で、年始の休業日（1/1〜1/3）なので 12/30 開始になる
    expect(cycleOf('2026-12-30', r).start).toBe('2026-12-30')
    expect(cycleOf('2026-12-29', r).end).toBe('2026-12-29')
    expect(shiftCycle(cycleOf('2026-12-10', r), 1, r).start).toBe('2026-12-30')
    expect(shiftCycle(cycleOf('2026-12-30', r), 1, r).start).toBe('2027-02-01')
  })
})
