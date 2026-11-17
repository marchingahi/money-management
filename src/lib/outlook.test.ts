import { addDays } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { buildDemoData } from './demo'
import { fromYMD, toYMD } from './dates'
import { buildOutlook, OUTLOOK_CYCLES } from './outlook'

const TODAY = '2026-11-05'

describe('今後12回の給料の見通し', () => {
  const data = buildDemoData(TODAY)
  const o = buildOutlook(data, TODAY)

  it('今のサイクルから 12 回分、隙間なくつながる', () => {
    expect(o.rows).toHaveLength(OUTLOOK_CYCLES)
    expect(o.rows[0].cycle.start <= TODAY && TODAY <= o.rows[0].cycle.end).toBe(true)
    for (let i = 1; i < o.rows.length; i++) {
      expect(o.rows[i].cycle.start).toBe(toYMD(addDays(fromYMD(o.rows[i - 1].cycle.end), 1)))
    }
  })

  it('収入 = 給料 + 賞与・臨時収入、差引 = 収入 − 支出。合計は各行の合計', () => {
    for (const r of o.rows) {
      expect(r.income).toBe(r.salary + r.extra)
      expect(r.net).toBe(r.income - r.spending)
    }
    expect(o.totals.income).toBe(o.rows.reduce((s, r) => s + r.income, 0))
    expect(o.totals.net).toBe(o.totals.income - o.totals.spending)
    // サンプルの 2 人の見込み手取りの合計 440,000 が毎回の給料になる（実額が入力済みの過去のサイクルは対象外）
    expect(o.rows.slice(1).every((r) => r.salary === 440000)).toBe(true)
  })

  it('口座の合計は、前の期間の合計に差引を足したものになる（口座に入る・出るお金だけの場合）', () => {
    for (let i = 2; i < o.rows.length; i++) {
      expect(o.rows[i].closing).toBe(o.rows[i - 1].closing! + o.rows[i].net)
    }
  })

  it('賞与は、入金後に最初に来る給料日から始まる期間の収入として入る', () => {
    const d = buildDemoData(TODAY)
    const probe = buildOutlook(d, TODAY)
    // 2 番目の期間の途中（開始日の 10 日後）に入る賞与 → 次（3 番目）の期間の収入
    const inSecond = fromYMD(probe.rows[1].cycle.start)
    const withBonus = {
      ...d,
      members: d.members.map((m, i) =>
        i === 0 ? { ...m, bonuses: [{ id: 'b', name: '賞与', month: inSecond.getMonth() + 1, day: inSecond.getDate() + 10, amount: 500000 }] } : m,
      ),
    }
    const o2 = buildOutlook(withBonus, TODAY)
    expect(o2.rows[1].extra).toBe(probe.rows[1].extra)
    expect(o2.rows[2].extra).toBe(probe.rows[2].extra + 500000)
    expect(o2.totals.extra).toBe(probe.totals.extra + 500000)
    // 賞与が入る期間から、口座の合計が賞与の分だけ増える
    expect(o2.rows[1].closing).toBe(probe.rows[1].closing)
    expect(o2.rows[2].closing).toBe(probe.rows[2].closing! + 500000)
  })

  it('口座の残高を入れていなければ、口座の合計は出さない', () => {
    const noBalance = { ...data, accounts: data.accounts.map((a) => ({ ...a, balance: undefined, balanceDate: undefined })) }
    expect(buildOutlook(noBalance, TODAY).rows.every((r) => r.closing == null && r.shortage == null)).toBe(true)
  })
})
