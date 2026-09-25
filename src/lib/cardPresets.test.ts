import { describe, expect, it } from 'vitest'
import { billingOf } from './billing'
import { CARD_PRESETS, describeSchedule } from './cardPresets'
import type { PaymentMethod } from './types'

const asMethod = (p: (typeof CARD_PRESETS)[number]): PaymentMethod => ({ ...p, kind: 'credit', order: 0 })

describe('CARD_PRESETS', () => {
  it('締め日・支払日・出典が正しい形', () => {
    for (const p of CARD_PRESETS) {
      expect(p.closingDay).toBeGreaterThanOrEqual(1)
      expect(p.closingDay).toBeLessThanOrEqual(31)
      expect(p.paymentDay).toBeGreaterThanOrEqual(1)
      expect(p.paymentDay).toBeLessThanOrEqual(31)
      expect([0, 1, 2]).toContain(p.monthOffset)
      expect(p.source).toMatch(/^https:\/\//)
    }
    expect(new Set(CARD_PRESETS.map((p) => p.name)).size).toBe(CARD_PRESETS.length)
  })

  it('表示用の説明', () => {
    expect(describeSchedule({ closingDay: 31, paymentDay: 27, monthOffset: 1 })).toBe('月末締め → 翌月27日払い')
    expect(describeSchedule({ closingDay: 5, paymentDay: 27, monthOffset: 0 })).toBe('5日締め → 当月27日払い')
  })

  it('当月払い（ライフカード 5日締め・当月27日）の引落日', () => {
    const life = asMethod(CARD_PRESETS.find((p) => p.name === 'ライフカード（当月27日払い）')!)
    // 9/5 締め → 9/27 は日曜 → 9/28
    expect(billingOf('2026-09-03', life)).toEqual({ closingDate: '2026-09-05', paymentDate: '2026-09-28' })
    // 9/6 の利用は 10/5 締め → 10/27
    expect(billingOf('2026-09-06', life).paymentDate).toBe('2026-10-27')
  })
})
