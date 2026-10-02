import { describe, expect, it } from 'vitest'
import { detectFixedCandidates } from './fixedDetect'
import { FIXED_CATEGORY, type Transaction } from './types'

const tx = (id: string, date: string, amount: number, memo: string, extra: Partial<Transaction> = {}): Transaction & { id: string } => ({
  id,
  date,
  amount,
  memo,
  category: '未分類',
  methodId: '1',
  ...extra,
})

describe('固定費の候補検出', () => {
  it('3か月連続で同じ店・同額なら候補になる', () => {
    const txs = [tx('a', '2026-08-05', 980, 'Netflix'), tx('b', '2026-09-05', 980, 'Netflix'), tx('c', '2026-10-05', 980, 'Netflix')]
    const [c] = detectFixedCandidates(txs)
    expect(c.memo).toBe('Netflix')
    expect(c.txs.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('2か月だけ・金額違い・月が飛ぶ場合は候補にならない', () => {
    expect(detectFixedCandidates([tx('a', '2026-09-05', 980, 'X'), tx('b', '2026-10-05', 980, 'X')])).toEqual([])
    expect(
      detectFixedCandidates([tx('a', '2026-08-05', 980, 'X'), tx('b', '2026-09-05', 990, 'X'), tx('c', '2026-10-05', 980, 'X')]),
    ).toEqual([])
    expect(
      detectFixedCandidates([tx('a', '2026-07-05', 980, 'X'), tx('b', '2026-09-05', 980, 'X'), tx('c', '2026-10-05', 980, 'X')]),
    ).toEqual([])
  })

  it('年をまたいでも連続と判定する', () => {
    const txs = [tx('a', '2025-12-05', 500, 'Y'), tx('b', '2026-01-05', 500, 'Y'), tx('c', '2026-02-05', 500, 'Y')]
    expect(detectFixedCandidates(txs)).toHaveLength(1)
  })

  it('固定費済みは対象から外し、全部固定費なら候補なし', () => {
    const txs = [
      tx('a', '2026-08-05', 980, 'Z', { category: FIXED_CATEGORY }),
      tx('b', '2026-09-05', 980, 'Z', { fixedCostId: 'f' }),
      tx('c', '2026-10-05', 980, 'Z'),
    ]
    const [c] = detectFixedCandidates(txs)
    expect(c.txs.map((t) => t.id)).toEqual(['c'])
    expect(detectFixedCandidates(txs.map((t) => ({ ...t, category: FIXED_CATEGORY })))).toEqual([])
  })

  it('店名が空の支出・「固定にしない」にしたものは候補にならない', () => {
    const noMemo = [tx('a', '2026-08-05', 1, ''), tx('b', '2026-09-05', 1, ''), tx('c', '2026-10-05', 1, '')]
    expect(detectFixedCandidates(noMemo)).toEqual([])
    const txs = [tx('a', '2026-08-05', 980, 'N'), tx('b', '2026-09-05', 980, 'N'), tx('c', '2026-10-05', 980, 'N')]
    expect(detectFixedCandidates(txs, undefined, ['N|980'])).toEqual([])
  })

  it('取り込み予定の支出を含む並びだけを返す', () => {
    const old = [tx('a', '2026-05-05', 100, 'P'), tx('b', '2026-06-05', 100, 'P'), tx('c', '2026-07-05', 100, 'P')]
    const added = tx('d', '2026-10-05', 300, 'Q')
    expect(detectFixedCandidates([...old, added], new Set([added]))).toEqual([])
    const added2 = tx('e', '2026-08-05', 100, 'P')
    expect(detectFixedCandidates([...old, added2], new Set([added2]))).toHaveLength(1)
  })
})
