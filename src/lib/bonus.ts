import { addDays } from 'date-fns'
import { cycleOf, dayInMonth, fromYMD, isBankHoliday, toYMD, type Cycle, type CycleRuleLike } from './dates'
import type { ExtraIncome, Member, YMD } from './types'

/*
 * 賞与（ボーナス）。人ごとに「月・日・見込み額」を設定すると、毎年その日に見込み額が入るものとして、
 * 入金日が含まれるサイクルの収入・入金先の口座（その人の振込口座）に加える。
 * 実際の額が分かったら、実額を臨時収入（bonusKey つき）として入力すると、見込み額の代わりにその額で数える。
 *
 * 賞与は、入金された日が属するサイクルではなく、「入金後に最初に来る給料日から始まるサイクル」の収入として数える。
 * 給料日までに入ったお金で、その給料日から次の給料日までの支払いをまかなう、という考え方
 * （給料日当日に入った賞与は、その給料日から始まるサイクルに入る）。
 */

/** 賞与が入金日に応じて収入になるサイクルの開始日（入金後に最初に来る給料日。当日なら当日） */
export function bonusFundingStart(date: YMD, rule: CycleRuleLike): YMD {
  const c = cycleOf(date, rule)
  return c.start === date ? c.start : toYMD(addDays(fromYMD(c.end), 1))
}

/** その入金（賞与）が、このサイクルの収入になるか */
export const fundsCycle = (date: YMD, cycle: Cycle, rule: CycleRuleLike) => bonusFundingStart(date, rule) === cycle.start

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
 * そのサイクルの収入になる賞与のうち、まだ実額が入力されていないものを、見込み額の入金として返す。
 * 実額が入力済みの賞与は、実額の臨時収入（extraIncomes）として別に数えるので、ここには含めない。
 */
export function bonusEstimatesFor(cycle: Cycle, members: Member[], extraIncomes: ExtraIncome[], rule: CycleRuleLike): ExtraIncome[] {
  // 入金日は、このサイクルの開始日以前（前のサイクルの中、または開始日当日）になる
  const years = [...new Set([fromYMD(cycle.start).getFullYear() - 1, fromYMD(cycle.start).getFullYear()])]
  const result: ExtraIncome[] = []
  for (const member of members) {
    for (const bonus of member.bonuses ?? []) {
      if (bonus.amount <= 0) continue
      for (const year of years) {
        const date = bonusDate(year, bonus.month, bonus.day)
        if (!fundsCycle(date, cycle, rule)) continue
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
