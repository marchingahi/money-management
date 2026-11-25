import { cashflowFor, outflows, projectAccounts, shortageKind } from './budget'
import { cycleOf, cycleRule, shiftCycle, type Cycle } from './dates'
import type { AppData } from '../useData'
import type { YMD } from './types'

/**
 * 今後の見通し。給料の期間ごとに、確定している収入（給料・賞与・臨時収入）と支出
 * （引落・口座引落・固定費・予定の出費・先取り貯金）を並べて、口座の合計残高の推移を出す。
 * これからの「普段の支出」（食費・日用品など、まだ記録されていない支出）は含めない。
 */
export interface OutlookRow {
  cycle: Cycle
  /** 給料の収入（実額が入力済みなら実額、なければ見込み） */
  salary: number
  /** 賞与・臨時収入 */
  extra: number
  income: number
  /** 引落・支払い・固定費・予定の出費・先取り貯金の合計 */
  spending: number
  /** 収入 − 支出 */
  net: number
  /** 期間の終わりの、口座の合計残高（残高を入れた口座がなければ null） */
  closing: number | null
  /** 口座の不足: transfer（口座間の振替で補える）/ insufficient（入金が必要） */
  shortage: 'transfer' | 'insufficient' | null
}

export interface Outlook {
  rows: OutlookRow[]
  totals: { salary: number; extra: number; income: number; spending: number; net: number }
}

export const OUTLOOK_CYCLES = 12

export function buildOutlook(data: AppData, today: YMD, count = OUTLOOK_CYCLES): Outlook {
  const { settings, members, incomes, accounts, methods, fixedCosts, transactions, transfers, planned, extraIncomes, adjustments, prepayments } = data
  const rule = cycleRule(settings)
  const cycle = cycleOf(today, rule)
  const cycles = Array.from({ length: count }, (_, n) => shiftCycle(cycle, n, rule))
  const flows = outflows(today, methods, transactions, fixedCosts, cycles, planned)

  // 口座残高の入力日が今のサイクルより前なら、そこから今のサイクルの手前まで（最大 6 回分）も繰越の計算に使う
  const oldestBalance = accounts.flatMap((a) => (a.balance != null && a.balanceDate ? [a.balanceDate] : [])).sort()[0]
  const lead: Cycle[] = []
  if (oldestBalance && oldestBalance < cycle.start) {
    for (let n = -1; n >= -6 && shiftCycle(cycle, n + 1, rule).start > oldestBalance; n--) {
      lead.unshift(shiftCycle(cycle, n, rule))
    }
  }

  const toCashflow = (c: Cycle) => cashflowFor(c, members, incomes, flows, settings, extraIncomes)
  const cfs = cycles.map(toCashflow)
  const carries = projectAccounts([...lead.map(toCashflow), ...cfs], accounts, settings, transfers, adjustments, prepayments)?.slice(lead.length) ?? null

  const rows = cfs.map((cf, i): OutlookRow => {
    const carry = carries?.[i]
    return {
      cycle: cf.cycle,
      salary: cf.income,
      extra: cf.extraTotal,
      income: cf.income + cf.extraTotal,
      spending: cf.outTotal + cf.savings,
      net: cf.remaining,
      closing: carry ? carry.closing : null,
      shortage: carry ? shortageKind(carry) : null,
    }
  })
  const sum = (f: (r: OutlookRow) => number) => rows.reduce((s, r) => s + f(r), 0)
  return {
    rows,
    totals: { salary: sum((r) => r.salary), extra: sum((r) => r.extra), income: sum((r) => r.income), spending: sum((r) => r.spending), net: sum((r) => r.net) },
  }
}
