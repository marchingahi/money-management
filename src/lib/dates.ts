import holiday_jp from '@holiday-jp/holiday_jp'
import { addDays, addMonths, differenceInCalendarDays, format, getDaysInMonth, isWeekend, parse } from 'date-fns'
import type { Settings, YMD } from './types'

export const toYMD = (d: Date): YMD => format(d, 'yyyy-MM-dd')
export const fromYMD = (s: YMD): Date => parse(s, 'yyyy-MM-dd', new Date(0))
export const todayYMD = (): YMD => toYMD(new Date())

/** 指定月の day 日。月の日数を超える場合（31 日指定の 2 月など）は月末に丸める */
export function dayInMonth(year: number, month0: number, day: number): Date {
  const last = getDaysInMonth(new Date(year, month0, 1))
  return new Date(year, month0, Math.min(day, last))
}

/** 金融機関の休業日（土日・祝日・年末年始 12/31〜1/3） */
export function isBankHoliday(d: Date): boolean {
  if (isWeekend(d) || holiday_jp.isHoliday(d)) return true
  const m = d.getMonth() + 1
  const day = d.getDate()
  return (m === 12 && day === 31) || (m === 1 && day <= 3)
}

export function nextBusinessDay(d: Date): Date {
  let cur = d
  while (isBankHoliday(cur)) cur = addDays(cur, 1)
  return cur
}

export interface Cycle {
  start: YMD
  /** 最終日（この日を含む） */
  end: YMD
}

/**
 * サイクルの開始日の決め方。通常は毎月 startDay 日だが、給料日がずれた月などは
 * overrides（開始する月 'yyyy-MM' → その月の開始日）で個別に変えられる。
 */
export interface CycleRule {
  startDay: number
  overrides?: Record<string, number>
}
/** 数値だけ渡した場合は、上書きなしの毎月 startDay 日として扱う */
export type CycleRuleLike = number | CycleRule

export const cycleRule = (s: Pick<Settings, 'cycleStartDay' | 'cycleStartOverrides'>): CycleRule => ({
  startDay: s.cycleStartDay,
  overrides: s.cycleStartOverrides,
})

/** 指定月に始まるサイクルの開始日 */
function startIn(year: number, month0: number, rule: CycleRuleLike): Date {
  const r = typeof rule === 'number' ? { startDay: rule } : rule
  const key = format(new Date(year, month0, 1), 'yyyy-MM')
  return dayInMonth(year, month0, r.overrides?.[key] ?? r.startDay)
}

/** date を含む家計サイクル（その月の開始日〜翌月の開始日の前日） */
export function cycleOf(date: YMD, rule: CycleRuleLike): Cycle {
  const d = fromYMD(date)
  let start = startIn(d.getFullYear(), d.getMonth(), rule)
  if (d < start) {
    const prev = addMonths(new Date(d.getFullYear(), d.getMonth(), 1), -1)
    start = startIn(prev.getFullYear(), prev.getMonth(), rule)
  }
  const nextMonth = addMonths(new Date(start.getFullYear(), start.getMonth(), 1), 1)
  const nextStart = startIn(nextMonth.getFullYear(), nextMonth.getMonth(), rule)
  return { start: toYMD(start), end: toYMD(addDays(nextStart, -1)) }
}

export function shiftCycle(cycle: Cycle, months: number, rule: CycleRuleLike): Cycle {
  const s = fromYMD(cycle.start)
  const m = addMonths(new Date(s.getFullYear(), s.getMonth(), 1), months)
  return cycleOf(toYMD(startIn(m.getFullYear(), m.getMonth(), rule)), rule)
}

/** サイクル内で「毎月 day 日」にあたる日付 */
export function dayWithinCycle(cycle: Cycle, day: number): YMD {
  const s = fromYMD(cycle.start)
  const candidate = dayInMonth(s.getFullYear(), s.getMonth(), day)
  if (toYMD(candidate) >= cycle.start) return toYMD(candidate)
  return toYMD(dayInMonth(s.getFullYear(), s.getMonth() + 1, day))
}

export const daysBetween = (from: YMD, to: YMD) => differenceInCalendarDays(fromYMD(to), fromYMD(from))

export function formatMD(ymd: YMD): string {
  const d = fromYMD(ymd)
  const w = '日月火水木金土'[d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}(${w})`
}
