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
 * businessDay が true のときは、開始日が休業日（土日・祝日など）なら前の営業日にする
 * （給料日が休みの場合は前倒しで振り込まれるため）。overrides で指定した日はそのまま使う。
 */
export interface CycleRule {
  startDay: number
  overrides?: Record<string, number>
  businessDay?: boolean
}
/** 数値だけ渡した場合は、上書きも営業日調整もない毎月 startDay 日として扱う */
export type CycleRuleLike = number | CycleRule

export const cycleRule = (
  s: Pick<Settings, 'cycleStartDay' | 'cycleStartOverrides' | 'cycleStartBusinessDay'>,
): CycleRule => ({
  startDay: s.cycleStartDay,
  overrides: s.cycleStartOverrides,
  // 未設定は「前の営業日にする」
  businessDay: s.cycleStartBusinessDay !== false,
})

/** 指定月（month0 は範囲外でもよい）に始まるサイクルの開始日 */
function startIn(year: number, month0: number, rule: CycleRuleLike): Date {
  const r = typeof rule === 'number' ? { startDay: rule } : rule
  const first = new Date(year, month0, 1)
  const y = first.getFullYear()
  const m = first.getMonth()
  const override = r.overrides?.[format(first, 'yyyy-MM')]
  let d = dayInMonth(y, m, override ?? r.startDay)
  if (override == null && r.businessDay) {
    while (isBankHoliday(d)) d = addDays(d, -1)
  }
  return d
}

/** 指定月に始まるサイクル（その月の開始日〜翌月の開始日の前日）。開始日の調整で前の月にずれ込むこともある */
export function cycleInMonth(year: number, month0: number, rule: CycleRuleLike): Cycle {
  const nextStart = startIn(year, month0 + 1, rule)
  return { start: toYMD(startIn(year, month0, rule)), end: toYMD(addDays(nextStart, -1)) }
}

/** date を含む家計サイクル */
export function cycleOf(date: YMD, rule: CycleRuleLike): Cycle {
  const d = fromYMD(date)
  const candidates = [1, 0, -1].map((o) => cycleInMonth(d.getFullYear(), d.getMonth() + o, rule))
  const hit = candidates.find((c) => c.start <= date && date <= c.end)
  if (hit) return hit
  // 上書きの組み合わせでサイクルが空になる月がある場合: 開始日が date 以前で最も新しいサイクル
  return candidates.filter((c) => c.start <= date).sort((x, y) => y.start.localeCompare(x.start))[0] ?? candidates[candidates.length - 1]
}

/** サイクルが始まる月（開始日の調整で前の月にずれ込んでいる場合も、元の月を返す） */
function monthOfCycle(cycle: Cycle, rule: CycleRuleLike): Date {
  const s = fromYMD(cycle.start)
  for (const o of [0, 1]) {
    const m = addMonths(new Date(s.getFullYear(), s.getMonth(), 1), o)
    if (toYMD(startIn(m.getFullYear(), m.getMonth(), rule)) === cycle.start) return m
  }
  return new Date(s.getFullYear(), s.getMonth(), 1)
}

export function shiftCycle(cycle: Cycle, months: number, rule: CycleRuleLike): Cycle {
  const m = addMonths(monthOfCycle(cycle, rule), months)
  return cycleInMonth(m.getFullYear(), m.getMonth(), rule)
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
