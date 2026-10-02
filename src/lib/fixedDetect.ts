import { isFixedTx } from './budget'
import { normalize } from './excelImport'
import type { Transaction } from './types'

/**
 * 「前月・前々月にも同じ店・同じ金額の支払いがある」支出を、固定費の候補として見つける。
 * 同じ店名（メモ）・同じ金額が 3 か月連続で並んだ場合に、その並びに含まれる
 * まだ固定費になっていない支出をまとめて候補にする。
 */

export interface FixedCandidate {
  /** 店名（メモ）と金額から作る判定キー。「固定にしない」を覚えるのにも使う */
  key: string
  memo: string
  amount: number
  /** 固定費にする対象の支出（取り込み前の分も含む） */
  txs: Transaction[]
  /** 連続している月（'yyyy-MM'、古い順） */
  months: string[]
}

export const candidateKey = (memo: string, amount: number) => `${normalize(memo)}|${amount}`

const monthOf = (t: Transaction) => t.date.slice(0, 7)

const shiftMonth = (ym: string, delta: number) => {
  const total = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * @param txs 判定に使う全ての支出（既存 + 取り込み予定）
 * @param focus 指定すると、この支出を含む並びだけを候補にする（取り込み時用）
 * @param ignoredKeys 「固定にしない」と選ばれたキー
 */
export function detectFixedCandidates(
  txs: Transaction[],
  focus?: Set<Transaction>,
  ignoredKeys: readonly string[] = [],
): FixedCandidate[] {
  const ignored = new Set(ignoredKeys)
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    // 店名が無い支出は同じ支払いかどうか判断できない。返金（0 以下）も対象外
    if (!normalize(t.memo) || t.amount <= 0) continue
    const key = candidateKey(t.memo, t.amount)
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const result: FixedCandidate[] = []
  for (const [key, group] of groups) {
    if (ignored.has(key)) continue
    const months = new Set(group.map(monthOf))
    // 3 か月連続で並んでいる月（真ん中の月を基準に、前後を含めて数える）
    const inRun = new Set<string>()
    for (const m of months) {
      if (months.has(shiftMonth(m, -1)) && months.has(shiftMonth(m, -2))) {
        inRun.add(m).add(shiftMonth(m, -1)).add(shiftMonth(m, -2))
      }
    }
    if (inRun.size === 0) continue

    const inRunTxs = group.filter((t) => inRun.has(monthOf(t)))
    const targets = inRunTxs.filter((t) => !isFixedTx(t))
    if (targets.length === 0) continue
    if (focus && !targets.some((t) => focus.has(t))) continue

    result.push({
      key,
      memo: normalize(group[0].memo),
      amount: group[0].amount,
      txs: targets,
      months: [...inRun].sort(),
    })
  }
  return result.sort((a, b) => a.memo.localeCompare(b.memo, 'ja') || a.amount - b.amount)
}
