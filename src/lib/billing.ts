import { dayInMonth, fromYMD, nextBusinessDay, toYMD } from './dates'
import type { PaymentMethod, YMD } from './types'

export interface Billing {
  /** この利用が含まれる締め日 */
  closingDate: YMD
  /** 口座から引き落とされる日（休業日は翌営業日） */
  paymentDate: YMD
}

/**
 * 利用日と支払い方法から、締め日と引落日を求める。
 * クレジット以外は利用日にそのままお金が出ていく扱い。
 * paymentMonth（'yyyy-MM'）を指定すると、計算ではなくその月の支払日を引落日とする。
 */
export function billingOf(date: YMD, method: PaymentMethod, paymentMonth?: string): Billing {
  if (method.kind !== 'credit') return { closingDate: date, paymentDate: date }

  let closing: Date
  let payment: Date
  if (paymentMonth) {
    const [y, m] = paymentMonth.split('-').map(Number)
    payment = dayInMonth(y, m - 1, method.paymentDay)
    closing = dayInMonth(y, m - 1 - method.monthOffset, method.closingDay)
  } else {
    const d = fromYMD(date)
    closing = dayInMonth(d.getFullYear(), d.getMonth(), method.closingDay)
    if (d > closing) closing = dayInMonth(d.getFullYear(), d.getMonth() + 1, method.closingDay)
    payment = dayInMonth(closing.getFullYear(), closing.getMonth() + method.monthOffset, method.paymentDay)
  }
  return { closingDate: toYMD(closing), paymentDate: toYMD(nextBusinessDay(payment)) }
}
