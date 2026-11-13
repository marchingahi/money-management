import { describe, expect, it } from 'vitest'
import { cashflowFor, projectAccounts } from './budget'
import { cycleOf } from './dates'
import type { Account, Settings } from './types'

const settings = { id: 'main', cycleStartDay: 25, savings: 0 } as Settings
const rule = { startDay: 25, businessDay: true }
const accounts: Account[] = [
  { id: 'a1', name: 'A', order: 1, balance: 23283, balanceDate: '2026-10-23' },
  { id: 'a2', name: 'B', order: 2, balance: 2030, balanceDate: '2026-10-23' },
  { id: 'a3', name: 'C', order: 3, balance: 623405, balanceDate: '2026-10-23' },
  { id: 'a4', name: 'D', order: 4 }, // 残高未入力の口座は含めない
]

describe('口座の繰越の合計（使える金額）', () => {
  it('残高を入れた口座の繰越の合計になる。残高未入力の口座は含まない', () => {
    const cycles = ['2026-10-27', '2026-11-27'].map((d) => cycleOf(d, rule))
    const carries = projectAccounts(cycles.map((c) => cashflowFor(c, [], [], [], settings)), accounts, settings)!
    expect(carries[0].opening).toBe(23283 + 2030 + 623405)
    expect(carries[0].accounts).toHaveLength(3)
    // 入出金がなければ、次のサイクルの繰越も同じ合計
    expect(carries[1].opening).toBe(carries[0].closing)
    expect(carries[1].opening).toBe(648718)
  })
})
