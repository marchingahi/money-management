import { addDays } from 'date-fns'
import { dayInMonth, fromYMD, isBankHoliday, toYMD, type Cycle } from './dates'
import type { ExtraIncome, Member, YMD } from './types'

/*
 * 賞与（ボーナス）。人ごとに「月・日・見込み額」を設定すると、毎年その日に見込み額が入るものとして、
 * 入金日が含まれるサイクルの収入・入金先の口座（その人の振込口座）に加える。
 * 実際の額が分かったら、実額を臨時収入（bonusKey つき）として入力すると、見込み額の代わりにその額で数える。
 */

/** 賞与は休業日なら前の営業日に前倒しで入る */
export function bonusDate(year: number, month: number, day: number): YMD {
  let d = dayInMonth(year, month - 1, day)
  while (isBankHoliday(d)) d = addDays(d, -1)
  return toYMD(d)
}

/** 賞与の設定と年から決まる、実額の紐付け用のキー */
export const bonusKey = (memberId: string, bonusId: string, year: number) => `bonus:${memberId}:${bonusId}:${year}`

/** 見込み額から作った（まだ実額が入力されていない）賞与の入金か */
export const isBonusEstimate = (x: ExtraIncome) => x.id?.startsWith('bonus-est:') ?? false

/**
 * そのサイクルに入金される賞与のうち、まだ実額が入力されていないものを、見込み額の入金として返す。
 * 実額が入力済みの賞与は、実額の臨時収入（extraIncomes）として別に数えるので、ここには含めない。
 */
export function bonusEstimatesFor(cycle: Cycle, members: Member[], extraIncomes: ExtraIncome[]): ExtraIncome[] {
  const years = [...new Set([fromYMD(cycle.start).getFullYear(), fromYMD(cycle.end).getFullYear()])]
  const result: ExtraIncome[] = []
  for (const member of members) {
    for (const bonus of member.bonuses ?? []) {
      if (bonus.amount <= 0) continue
      for (const year of years) {
        const date = bonusDate(year, bonus.month, bonus.day)
        if (date < cycle.start || date > cycle.end) continue
        const key = bonusKey(member.id!, bonus.id, year)
        if (extraIncomes.some((e) => e.bonusKey === key)) continue
        result.push({
          id: `bonus-est:${key}`,
          bonusKey: key,
          date,
          amount: bonus.amount,
          accountId: member.accountId ?? '',
          memo: `${member.name}の${bonus.name.trim() || '賞与'}`,
        })
      }
    }
  }
  return result
}
