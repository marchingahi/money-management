import { cycleOf, fromYMD, type Cycle } from './dates'
import type { PlannedExpense, Transaction, YMD } from './types'

/*
 * 予定の出費の確保（積立）。
 * 積立開始のサイクルから「予定日のサイクルの前」まで、毎サイクル均等に確保する。
 * 支払い（一部払いを含む）は確保したお金から払ったとみなし、普段の支出には数えない。
 * 精算するサイクル（予定日のサイクル。予定日より前に払い終えたらそのサイクル）で、
 * 最終的な額 − それまでに確保した額 だけを予算から引く（安く済めば予算に戻る）。
 */

export interface PlannedStatus {
  plan: PlannedExpense & { id: string }
  /** 予定日を含むサイクル */
  dueCycle: Cycle
  /** 精算するサイクル（予定日のサイクル、または予定日より前に払い終えたサイクル） */
  settleCycle: Cycle
  /** 確保するサイクルの数（予定日のサイクルは含まない） */
  reserveCycles: number
  /** このサイクルで確保する額 */
  thisCycleReserve: number
  /** このサイクルより前に確保し終わっている額 */
  reservedBefore: number
  /** 支払いとして記録された額の合計（未払いなら undefined） */
  paid?: number
  /** 支払いが完了しているか（合計が予定額に達した、または「これで完了」にした） */
  closed: boolean
  /** まだ支払っていない額（完了していれば 0） */
  remaining: number
  /** 精算するサイクルで予算から引く額（最終的な額 − 確保した額） */
  dueCharge: number
  /** このサイクルの予算から引く額の合計 */
  thisCycleTotal: number
  /** 予定日を過ぎたのに払い終わっていない */
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

/** k 回分（0〜n）確保し終えた額 */
const reservedUpTo = (amount: number, n: number, k: number) =>
  n === 0 ? 0 : Math.floor((amount * Math.min(Math.max(k, 0), n)) / n)

/** 支払いの記録が予定額に届いていない予定の出費の、残りの額（完了済みなら 0） */
export function remainingOf(plan: PlannedExpense, paid: number): number {
  if (plan.closedOn) return 0
  return Math.max(plan.amount - paid, 0)
}

export function plannedStatuses(
  plans: (PlannedExpense & { id: string })[],
  txs: Transaction[],
  cycle: Cycle,
  startDay: number,
  today: YMD,
): PlannedStatus[] {
  return plans.map((plan) => {
    const dueCycle = cycleOf(plan.date, startDay)
    const startCycle = cycleOf(plan.reserveFrom < plan.date ? plan.reserveFrom : plan.date, startDay)
    const reserveCycles = Math.max(0, cyclesBetween(startCycle, dueCycle))

    const linked = txs.filter((t) => t.plannedId === plan.id).sort((a, b) => a.date.localeCompare(b.date))
    const paidSum = linked.reduce((s, t) => s + t.amount, 0)
    const paid = linked.length ? paidSum : undefined
    const closed = plan.closedOn != null || (paid != null && paidSum >= plan.amount)
    // 払い終えた日（「これで完了」の日、または合計が予定額に達した最後の支払い日）
    const closedDate = plan.closedOn ?? linked[linked.length - 1]?.date
    const closedCycle = closed && closedDate ? cycleOf(closedDate, startDay) : undefined
    const settleCycle = closedCycle && closedCycle.start < dueCycle.start ? closedCycle : dueCycle

    const k = cyclesBetween(startCycle, cycle)
    const kSettle = cyclesBetween(startCycle, settleCycle)
    const reserveUntil = Math.min(reserveCycles, Math.max(kSettle, 0))
    const thisCycleReserve = k >= 0 && k < reserveUntil ? shareAt(plan.amount, reserveCycles, k) : 0
    const reservedBefore = reservedUpTo(plan.amount, reserveCycles, Math.min(k, reserveUntil))

    // 完了していなければ、少なくとも予定額は必要として扱う（残りを確保したままにする）
    const finalAmount = closed ? paidSum : Math.max(plan.amount, paidSum)
    const dueCharge =
      cycle.start === settleCycle.start ? finalAmount - reservedUpTo(plan.amount, reserveCycles, reserveUntil) : 0

    return {
      plan,
      dueCycle,
      settleCycle,
      reserveCycles,
      thisCycleReserve,
      reservedBefore,
      paid,
      closed,
      remaining: closed ? 0 : remainingOf(plan, paidSum),
      dueCharge,
      thisCycleTotal: thisCycleReserve + dueCharge,
      overdue: !closed && plan.date < today,
    }
  })
}
