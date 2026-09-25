import { billingOf } from './billing'
import { daysBetween, dayWithinCycle, type Cycle } from './dates'
import { FIXED_CATEGORY, type Account, type Transfer, type FixedCost, type Income, type Member, type PaymentMethod, type Settings, type Transaction, type YMD } from './types'

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

export const incomeDate = (cycle: Cycle, member: Member) => dayWithinCycle(cycle, member.payday)

/** 口座のお金が動く予定 1 件 */
export interface AccountEvent {
  /** 残高入力日当日の予定を「未反映」として指定するためのキー */
  key: string
  date: YMD
  /** 入金はプラス、出金はマイナス */
  amount: number
  accountId: string
  label: string
}

/** 口座を使わない支払い方法（財布の現金など）に指定する値 */
export const NO_ACCOUNT = 'none'

/** 口座の指定がなければ最初の口座を使う */
export function accountResolver(accounts: Account[]) {
  const ids = new Set(accounts.map((a) => a.id))
  return (explicit?: string) => {
    if (explicit === NO_ACCOUNT) return undefined
    return explicit && ids.has(explicit) ? explicit : accounts[0]?.id
  }
}

/** あるサイクルの収支と口座間の振替を、口座ごとの入出金の予定に分解する */
export function cycleEvents(
  cf: CycleCashflow,
  accounts: Account[],
  settings: Settings,
  transfers: Transfer[] = [],
): AccountEvent[] {
  const resolve = accountResolver(accounts)
  const events: AccountEvent[] = []
  const push = (e: Omit<AccountEvent, 'accountId'>, explicit?: string) => {
    const accountId = resolve(explicit)
    if (accountId && e.amount !== 0) events.push({ ...e, accountId })
  }
  for (const i of cf.incomes) {
    push(
      { key: `income:${i.member.id}@${cf.cycle.start}`, date: incomeDate(cf.cycle, i.member), amount: i.amount, label: `${i.member.name}の手取り` },
      i.member.accountId,
    )
  }
  for (const o of cf.items) {
    push(
      {
        key: `out:${o.method.id}@${o.paymentDate}`,
        date: o.paymentDate,
        amount: -o.amount,
        label: o.method.kind === 'credit' ? `${o.method.name} 引落` : `${o.method.name}での支払い`,
      },
      o.method.accountId,
    )
  }
  push(
    { key: `savings@${cf.cycle.start}`, date: cf.cycle.start, amount: -cf.savings, label: '先取り貯金' },
    settings.savingsAccountId,
  )
  // 振替は両方の口座が登録されているものだけ（家計全体では増減しない）
  const ids = new Set(accounts.map((a) => a.id))
  for (const t of transfers) {
    if (!inCycle(t.date, cf.cycle) || !ids.has(t.fromAccountId) || !ids.has(t.toAccountId)) continue
    const from = accounts.find((a) => a.id === t.fromAccountId)!.name
    const to = accounts.find((a) => a.id === t.toAccountId)!.name
    events.push({ key: `transfer:${t.id}:out`, date: t.date, amount: -t.amount, accountId: t.fromAccountId, label: `${to}へ振替` })
    events.push({ key: `transfer:${t.id}:in`, date: t.date, amount: t.amount, accountId: t.toAccountId, label: `${from}から振替` })
  }
  // 同じ日は入金を先に数える（振替で補った日に引落があっても不足扱いにしない）
  return events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
}

/** 予定が口座残高にすでに反映されているか（残高入力日より前、または当日で未反映に指定されていない） */
export function isSettled(e: AccountEvent, account: Account): boolean {
  if (!account.balanceDate) return false
  if (e.date < account.balanceDate) return true
  return e.date === account.balanceDate && !(account.unsettled ?? []).includes(e.key)
}

export interface AccountCarry {
  account: Account
  /** 残高入力日がこのサイクル内にある（開始残高 = 入力した残高） */
  fromInput: boolean
  opening: number
  closing: number
  /** 期間中に残高がマイナスになる最初の予定 */
  shortage: { date: YMD; balance: number; label: string } | null
}

export interface CycleCarry {
  accounts: AccountCarry[]
  opening: number
  closing: number
}

/**
 * 残高を入れた口座ごとに、連続したサイクルの繰越を計算する。
 * cashflows は、最も古い残高入力日を含むサイクルから始まっている必要がある。
 */
export function projectAccounts(
  cashflows: CycleCashflow[],
  accounts: Account[],
  settings: Settings,
  transfers: Transfer[] = [],
): CycleCarry[] | null {
  const tracked = accounts.filter((a) => a.balance != null && a.balanceDate)
  if (!tracked.length) return null
  const running = new Map(tracked.map((a) => [a.id!, a.balance!]))

  return cashflows.map((cf) => {
    const events = cycleEvents(cf, accounts, settings, transfers)
    const carries = tracked.map((account) => {
      const opening = running.get(account.id!)!
      let balance = opening
      let shortage: AccountCarry['shortage'] = null
      for (const e of events) {
        if (e.accountId !== account.id || isSettled(e, account)) continue
        balance += e.amount
        if (balance < 0 && !shortage) shortage = { date: e.date, balance, label: e.label }
      }
      running.set(account.id!, balance)
      return { account, fromInput: inCycle(account.balanceDate!, cf.cycle), opening, closing: balance, shortage }
    })
    return {
      accounts: carries,
      opening: carries.reduce((s, c) => s + c.opening, 0),
      closing: carries.reduce((s, c) => s + c.closing, 0),
    }
  })
}
