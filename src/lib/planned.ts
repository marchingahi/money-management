import { cycleOf, fromYMD, type Cycle } from './dates'
import type { PlannedExpense, Transaction } from './types'

/*
 * 予定の出費の確保（積立）。
 * 積立開始のサイクルから「予定日のサイクルの前」まで、毎サイクル均等に確保する。
 * 予定日のサイクルでは確保済みのお金から払うので、予算から引くのは「実際の額 − 確保済みの額」だけ。
 */

export interface PlannedStatus {
  plan: PlannedExpense & { id: string }
  /** 予定日を含むサイクル */
  dueCycle: Cycle
  /** 確保するサイクルの数（予定日のサイクルは含まない） */
  reserveCycles: number
  /** このサイクルで確保する額 */
  thisCycleReserve: number
  /** このサイクルより前に確保し終わっている額 */
  reservedBefore: number
  /** 支払いとして記録された額（未払いなら undefined） */
  paid?: number
  /** 予定日のサイクルで予算から引く額（実際の額 − 確保した額） */
  dueCharge: number
  /** このサイクルの予算から引く額の合計 */
  thisCycleTotal: number
  /** 予定日を過ぎたのに支払いの記録がない */
  overdue: boolean
}

/** サイクル a から b まで何サイクル離れているか（b が後なら正） */
const cyclesBetween = (a: Cycle, b: Cycle) => {
  const da = fromYMD(a.start)
  const db = fromYMD(b.start)
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
}

/** k 回目（0 始まり）の確保額。端数は後ろの回に寄せ、合計がちょうど amount になる */
const shareAt = (amount: number, n: number, k: number) =>
  Math.floor((amount * (k + 1)) / n) - Math.floor((amount * k) / n)

export function plannedStatuses(
  plans: (PlannedExpense & { id: string })[],
  txs: Transaction[],
  cycle: Cycle,
  startDay: number,
  today: string,
): PlannedStatus[] {
  return plans.map((plan) => {
    const dueCycle = cycleOf(plan.date, startDay)
    const startCycle = cycleOf(plan.reserveFrom < plan.date ? plan.reserveFrom : plan.date, startDay)
    const reserveCycles = Math.max(0, cyclesBetween(startCycle, dueCycle))
    const k = cyclesBetween(startCycle, cycle)
    const thisCycleReserve = k >= 0 && k < reserveCycles ? shareAt(plan.amount, reserveCycles, k) : 0
    const reservedBefore =
      reserveCycles === 0 ? 0 : Math.floor((plan.amount * Math.min(Math.max(k, 0), reserveCycles)) / reserveCycles)

    const linked = txs.filter((t) => t.plannedId === plan.id)
    const paid = linked.length ? linked.reduce((s, t) => s + t.amount, 0) : undefined
    const reserved = reserveCycles > 0 ? plan.amount : 0
    const isDue = cycle.start === dueCycle.start
    const dueCharge = isDue ? (paid ?? plan.amount) - reserved : 0

    return {
      plan,
      dueCycle,
      reserveCycles,
      thisCycleReserve,
      reservedBefore,
      paid,
      dueCharge,
      thisCycleTotal: thisCycleReserve + dueCharge,
      overdue: paid == null && plan.date < today,
    }
  })
}
