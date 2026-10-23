import { describe, expect, it } from 'vitest'
import { cardTimings } from './cardTiming'
import type { PaymentMethod } from './types'

const credit = (id: string, name: string, closingDay: number, paymentDay: number, order: number): PaymentMethod => ({
  id,
  name,
  kind: 'credit',
  closingDay,
  paymentDay,
  monthOffset: 1,
  order,
})
const methods: PaymentMethod[] = [
  credit('1', 'Olive', 31, 26, 1), // 月末締め 翌26日
  credit('3', 'セゾン', 10, 4, 3), // 10日締め 翌4日
  { id: '9', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 9 },
]
const rule = { startDay: 25, businessDay: true, overrides: { '2026-10': 23 } }

describe('カード別の締め日・引落日', () => {
  const t = cardTimings('2026-10-23', methods, rule)

  it('クレジットだけを、引落日の早い順に並べる', () => {
    expect(t.map((x) => x.method.name)).toEqual(['Olive', 'セゾン'])
  })

  it('今日使った場合の締め日・引落日・締めまでの日数', () => {
    // Olive: 10/31 締め → 11/26 引落
    expect(t[0]).toMatchObject({ closingDate: '2026-10-31', daysToClosing: 8, paymentDate: '2026-11-26' })
    // セゾン: 10/23 の利用 → 11/10 締め → 12/4 引落（12/4 は金曜）
    expect(t[1]).toMatchObject({ closingDate: '2026-11-10', daysToClosing: 18, paymentDate: '2026-12-04' })
  })

  it('引落日を払う給料のサイクル（11/26 は 11/25 の給料、12/4 も同じサイクル）', () => {
    expect(t[1].payCycle.start).toBe('2026-11-25')
    expect(t[0].payCycle.start).toBe('2026-11-25')
  })

  it('締め日当日は 0 日', () => {
    expect(cardTimings('2026-10-31', methods, rule).find((x) => x.method.name === 'Olive')?.daysToClosing).toBe(0)
  })
})
