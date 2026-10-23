import { billingOf } from './billing'
import { cycleOf, daysBetween, type Cycle, type CycleRuleLike } from './dates'
import type { PaymentMethod, YMD } from './types'

/** 今日クレジットカードで使った場合の、締め日・引落日と、それを払う給料のサイクル */
export interface CardTiming {
  method: PaymentMethod
  closingDate: YMD
  /** 締め日まであと何日か（締め日当日は 0） */
  daysToClosing: number
  paymentDate: YMD
  /** 引落日が属する給料のサイクル */
  payCycle: Cycle
}

export function cardTimings(today: YMD, methods: PaymentMethod[], rule: CycleRuleLike): CardTiming[] {
  return methods
    .filter((m) => m.kind === 'credit')
    .map((method) => {
      const { closingDate, paymentDate } = billingOf(today, method)
      return {
        method,
        closingDate,
        daysToClosing: daysBetween(today, closingDate),
        paymentDate,
        payCycle: cycleOf(paymentDate, rule),
      }
    })
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.method.order - b.method.order)
}
