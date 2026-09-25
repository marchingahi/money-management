import { billingOf } from './billing'
import { daysBetween, dayWithinCycle, type Cycle } from './dates'
import { FIXED_CATEGORY, type FixedCost, type Income, type Member, type PaymentMethod, type Settings, type Transaction, type YMD } from './types'

export interface FixedStatus {
  cost: FixedCost
  date: YMD
  /** 実額が入力済みならその合計、未入力なら undefined */
  actual?: number
  /** 予算上確保する額（実額があれば実額、なければ見込み額） */
  reserved: number
}

export interface IncomeStatus {
  member: Member
  estimate: number
  /** このサイクルの実額（入力済みの場合） */
  actual?: number
  amount: number
}

export interface BudgetSummary {
  income: number
  incomes: IncomeStatus[]
  /** 固定費の合計（登録済み固定費の確保額 + それ以外の「固定費」カテゴリの支出） */
  fixedTotal: number
  /** 登録済み固定費に紐付かない「固定費」カテゴリの支出（Excel 取り込み分など） */
  otherFixed: Transaction[]
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

/** 普段の支出ではなく固定費として扱う支出か */
export const isFixedTx = (t: Transaction) => t.fixedCostId != null || t.category === FIXED_CATEGORY

export function fixedStatuses(fixedCosts: FixedCost[], txs: Transaction[], cycle: Cycle): FixedStatus[] {
  return fixedCosts.map((cost) => {
    const linked = txs.filter((t) => t.fixedCostId === cost.id && inCycle(t.date, cycle))
    const actual = linked.length ? linked.reduce((s, t) => s + t.amount, 0) : undefined
    return { cost, date: dayWithinCycle(cycle, cost.day), actual, reserved: actual ?? cost.amount }
  })
}

/** 見込み手取り。時給の場合は 時給 × 時間 × 日数 × (1 − 控除率) */
export function expectedTakeHome(m: Member): number {
  if (m.payType !== 'hourly') return m.takeHome
  return Math.floor(m.hourlyWage * m.hoursPerDay * m.daysPerMonth * (1 - m.deductionRate / 100))
}

export function incomeStatuses(members: Member[], incomes: Income[], cycle: Cycle): IncomeStatus[] {
  return members.map((member) => {
    const estimate = expectedTakeHome(member)
    const actual = incomes.find((i) => i.memberId === member.id && i.cycleStart === cycle.start)?.amount
    return { member, estimate, actual, amount: actual ?? estimate }
  })
}

export function summarize(
  cycle: Cycle,
  today: YMD,
  members: Member[],
  incomeRecords: Income[],
  fixedCosts: FixedCost[],
  txs: Transaction[],
  settings: Settings,
): BudgetSummary {
  const incomes = incomeStatuses(members, incomeRecords, cycle)
  const income = incomes.reduce((s, i) => s + i.amount, 0)
  const fixed = fixedStatuses(fixedCosts, txs, cycle)
  const otherFixed = txs.filter((t) => t.fixedCostId == null && t.category === FIXED_CATEGORY && inCycle(t.date, cycle))
  const fixedTotal = fixed.reduce((s, f) => s + f.reserved, 0) + otherFixed.reduce((s, t) => s + t.amount, 0)
  const budget = income - fixedTotal - settings.savings
  const spent = txs
    .filter((t) => !isFixedTx(t) && inCycle(t.date, cycle))
    .reduce((s, t) => s + t.amount, 0)
  const remaining = budget - spent
  const daysLeft = inCycle(today, cycle) ? daysBetween(today, cycle.end) + 1 : null
  const perDay = daysLeft ? Math.floor(Math.max(remaining, 0) / daysLeft) : null
  return { income, incomes, fixedTotal, otherFixed, savings: settings.savings, budget, spent, remaining, daysLeft, perDay, fixed }
}

/** 口座などから実際にお金が出ていく単位（支払い方法 × 出金日） */
export interface Outflow {
  method: PaymentMethod
  /** 出金日。クレジットは引落日、それ以外は利用日 */
  paymentDate: YMD
  closingDate: YMD
  amount: number
  /** 金額が確定しているか（クレジットは締め日を過ぎたか） */
  confirmed: boolean
  /** 未入力の固定費見込みを含むか */
  includesEstimate: boolean
}
export type UpcomingBilling = Outflow

/**
 * すべての支出を出金日ごとにまとめる。
 * cyclesForEstimates の固定費で実額が未入力のものは見込み額で含める。
 */
export function outflows(
  today: YMD,
  methods: PaymentMethod[],
  txs: Transaction[],
  fixedCosts: FixedCost[],
  cyclesForEstimates: Cycle[],
): Outflow[] {
  const byId = new Map(methods.map((m) => [m.id!, m]))
  const groups = new Map<string, Outflow>()

  const add = (date: YMD, amount: number, methodId: string, estimate: boolean, paymentMonth?: string) => {
    const method = byId.get(methodId)
    if (!method) return
    const { closingDate, paymentDate } = billingOf(date, method, paymentMonth)
    const key = `${methodId}|${paymentDate}`
    const g = groups.get(key) ?? {
      method,
      paymentDate,
      closingDate,
      amount: 0,
      confirmed: method.kind !== 'credit' || closingDate < today,
      includesEstimate: false,
    }
    g.amount += amount
    g.includesEstimate ||= estimate
    groups.set(key, g)
  }

  for (const t of txs) add(t.date, t.amount, t.methodId, false, t.paymentMonth)
  for (const cycle of cyclesForEstimates) {
    for (const f of fixedStatuses(fixedCosts, txs, cycle)) {
      if (f.actual == null) add(f.date, f.cost.amount, f.cost.methodId, true)
    }
  }

  return [...groups.values()].sort(
    (a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.method.order - b.method.order,
  )
}

/** 今日以降に引き落とされるクレジットカードの請求 */
export function upcomingBillings(
  today: YMD,
  methods: PaymentMethod[],
  txs: Transaction[],
  fixedCosts: FixedCost[],
  cyclesForEstimates: Cycle[],
): UpcomingBilling[] {
  return outflows(today, methods, txs, fixedCosts, cyclesForEstimates).filter(
    (o) => o.method.kind === 'credit' && o.paymentDate >= today,
  )
}

/** ある給料サイクルの「引落ベース」の収支: その給料から、期間中に出ていくお金を引いた残り */
export interface CycleCashflow {
  cycle: Cycle
  incomes: IncomeStatus[]
  income: number
  /** 期間中に出ていくお金すべて（出金日順） */
  items: Outflow[]
  /** 期間中に引き落とされるクレジットカードの請求 */
  cards: Outflow[]
  /** 期間中に使った現金・QR・デビットなど（支払い方法ごとの合計） */
  direct: { method: PaymentMethod; amount: number; includesEstimate: boolean }[]
  outTotal: number
  savings: number
  remaining: number
  /** 締め日前のカード請求を含む（これから使うほど減る） */
  open: boolean
}

export function cashflowFor(
  cycle: Cycle,
  members: Member[],
  incomeRecords: Income[],
  flows: Outflow[],
  settings: Settings,
): CycleCashflow {
  const incomes = incomeStatuses(members, incomeRecords, cycle)
  const income = incomes.reduce((s, i) => s + i.amount, 0)
  const inRange = flows.filter((o) => inCycle(o.paymentDate, cycle))
  const cards = inRange.filter((o) => o.method.kind === 'credit')

  const directMap = new Map<string, CycleCashflow['direct'][number]>()
  for (const o of inRange) {
    if (o.method.kind === 'credit') continue
    const d = directMap.get(o.method.id!) ?? { method: o.method, amount: 0, includesEstimate: false }
    d.amount += o.amount
    d.includesEstimate ||= o.includesEstimate
    directMap.set(o.method.id!, d)
  }
  const direct = [...directMap.values()].sort((a, b) => a.method.order - b.method.order)

  const outTotal = inRange.reduce((s, o) => s + o.amount, 0)
  return {
    cycle,
    incomes,
    income,
    items: inRange,
    cards,
    direct,
    outTotal,
    savings: settings.savings,
    remaining: income - outTotal - settings.savings,
    open: cards.some((c) => !c.confirmed),
  }
}

/** 口座残高を起点にした繰越 */
export interface Carry {
  balanceDate: YMD
  /** 残高入力日がこのサイクル内にある（開始残高 = 入力した残高） */
  fromInput: boolean
  /** 開始時点の残高（前回からの繰越、または入力した残高） */
  opening: number
  /** 次の給料日前日の残高予測 */
  closing: number
}

/** 入出金のうち、残高入力日より後のもの（まだ残高に反映されていないもの）か */
export const isPending = (date: YMD, balanceDate: YMD) => date > balanceDate

export const incomeDate = (cycle: Cycle, member: Member) => dayWithinCycle(cycle, member.payday)

/**
 * 連続したサイクルの収支に、口座残高からの繰越を付ける。
 * cashflows は残高入力日を含むサイクルから始まっている必要がある。
 */
export function applyCarry(cashflows: CycleCashflow[], balance: number, balanceDate: YMD): Carry[] {
  let running = balance
  return cashflows.map((cf) => {
    const events = [
      ...cf.incomes.map((i) => ({ date: incomeDate(cf.cycle, i.member), amount: i.amount })),
      ...cf.items.map((o) => ({ date: o.paymentDate, amount: -o.amount })),
      { date: cf.cycle.start, amount: -cf.savings },
    ]
    const opening = running
    const closing = opening + events.filter((e) => isPending(e.date, balanceDate)).reduce((s, e) => s + e.amount, 0)
    running = closing
    return { balanceDate, fromInput: inCycle(balanceDate, cf.cycle), opening, closing }
  })
}
