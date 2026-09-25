import { billingOf } from './billing'
import { daysBetween, dayWithinCycle, type Cycle } from './dates'
import type { FixedCost, Member, PaymentMethod, Settings, Transaction, YMD } from './types'

export interface FixedStatus {
  cost: FixedCost
  date: YMD
  /** 実額が入力済みならその合計、未入力なら undefined */
  actual?: number
  /** 予算上確保する額（実額があれば実額、なければ見込み額） */
  reserved: number
}

export interface BudgetSummary {
  income: number
  fixedTotal: number
  savings: number
  /** 自由に使える予算 = 収入 − 固定費 − 先取り貯金 */
  budget: number
  /** 固定費以外で使った額（利用日ベース） */
  spent: number
  remaining: number
  /** 今日を含む残り日数。サイクル外なら null */
  daysLeft: number | null
  perDay: number | null
  fixed: FixedStatus[]
}

export const inCycle = (date: YMD, cycle: Cycle) => date >= cycle.start && date <= cycle.end

export function fixedStatuses(fixedCosts: FixedCost[], txs: Transaction[], cycle: Cycle): FixedStatus[] {
  return fixedCosts.map((cost) => {
    const linked = txs.filter((t) => t.fixedCostId === cost.id && inCycle(t.date, cycle))
    const actual = linked.length ? linked.reduce((s, t) => s + t.amount, 0) : undefined
    return { cost, date: dayWithinCycle(cycle, cost.day), actual, reserved: actual ?? cost.amount }
  })
}

export function summarize(
  cycle: Cycle,
  today: YMD,
  members: Member[],
  fixedCosts: FixedCost[],
  txs: Transaction[],
  settings: Settings,
): BudgetSummary {
  const income = members.reduce((s, m) => s + m.takeHome, 0)
  const fixed = fixedStatuses(fixedCosts, txs, cycle)
  const fixedTotal = fixed.reduce((s, f) => s + f.reserved, 0)
  const budget = income - fixedTotal - settings.savings
  const spent = txs
    .filter((t) => t.fixedCostId == null && inCycle(t.date, cycle))
    .reduce((s, t) => s + t.amount, 0)
  const remaining = budget - spent
  const daysLeft = inCycle(today, cycle) ? daysBetween(today, cycle.end) + 1 : null
  const perDay = daysLeft ? Math.floor(Math.max(remaining, 0) / daysLeft) : null
  return { income, fixedTotal, savings: settings.savings, budget, spent, remaining, daysLeft, perDay, fixed }
}

export interface UpcomingBilling {
  method: PaymentMethod
  paymentDate: YMD
  closingDate: YMD
  amount: number
  /** 締め日を過ぎて請求額が確定しているか */
  confirmed: boolean
  /** 未入力の固定費見込みを含むか */
  includesEstimate: boolean
}

/**
 * 今日以降に引き落とされるクレジットカードの請求を、カード×引落日ごとにまとめる。
 * 当サイクル以降の固定費で実額が未入力のものは見込み額で含める。
 */
export function upcomingBillings(
  today: YMD,
  methods: PaymentMethod[],
  txs: Transaction[],
  fixedCosts: FixedCost[],
  cyclesForEstimates: Cycle[],
): UpcomingBilling[] {
  const byId = new Map(methods.map((m) => [m.id!, m]))
  const groups = new Map<string, UpcomingBilling>()

  const add = (date: YMD, amount: number, methodId: number, estimate: boolean) => {
    const method = byId.get(methodId)
    if (!method || method.kind !== 'credit') return
    const { closingDate, paymentDate } = billingOf(date, method)
    if (paymentDate < today) return
    const key = `${methodId}|${paymentDate}`
    const g = groups.get(key) ?? {
      method,
      paymentDate,
      closingDate,
      amount: 0,
      confirmed: closingDate < today,
      includesEstimate: false,
    }
    g.amount += amount
    g.includesEstimate ||= estimate
    groups.set(key, g)
  }

  for (const t of txs) add(t.date, t.amount, t.methodId, false)
  for (const cycle of cyclesForEstimates) {
    for (const f of fixedStatuses(fixedCosts, txs, cycle)) {
      if (f.actual == null) add(f.date, f.cost.amount, f.cost.methodId, true)
    }
  }

  return [...groups.values()].sort(
    (a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.method.order - b.method.order,
  )
}
