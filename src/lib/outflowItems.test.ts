import { describe, expect, it } from 'vitest'
import { outflows } from './budget'
import { cycleOf } from './dates'
import type { FixedCost, PaymentMethod, PlannedExpense, Transaction } from './types'

const cash: PaymentMethod = { id: 'k', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 1 }
const card: PaymentMethod = { id: 'c', name: 'カード', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 2 }
const cycle = cycleOf('2026-10-27', { startDay: 25, businessDay: true }) // 10/23〜11/24
const tx = (id: string, date: string, amount: number, methodId: string, memo = '', extra: Partial<Transaction> = {}): Transaction => ({
  id,
  date,
  amount,
  category: '食費',
  methodId,
  memo,
  ...extra,
})

describe('出金の中身', () => {
  it('現金の支払いの中身（記録済みの支出・固定費の見込み・予定の出費の残り）が、金額の合計と合う', () => {
    const fixed: FixedCost = { id: 'f', name: '駐輪場', amount: 400, day: 27, methodId: 'k' }
    const plan: PlannedExpense = { id: 'p', name: '修繕積立', amount: 12000, date: '2026-11-07', methodId: 'k', reserveFrom: '2026-10-01' }
    const txs = [tx('1', '2026-10-30', 800, 'k', 'ランチ'), tx('2', '2026-10-30', 500, 'k', 'コンビニ'), tx('3', '2026-10-31', 1200, 'k', '')]
    const flows = outflows('2026-10-27', [cash, card], txs, [fixed], [cycle], [plan])
    const direct = flows.filter((f) => f.method.id === 'k')
    const items = direct.flatMap((f) => f.items)
    // 日付ごとの出金（同じ日の支出は 1 つにまとまる）の合計 = 中身の合計
    expect(direct.reduce((s, f) => s + f.amount, 0)).toBe(items.reduce((s, i) => s + i.amount, 0))
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]))
    expect(byLabel['ランチ']).toMatchObject({ amount: 800, estimate: false, txId: '1' })
    expect(byLabel['コンビニ']).toMatchObject({ amount: 500, estimate: false, txId: '2' })
    // メモがなければカテゴリ名
    expect(byLabel['食費']).toMatchObject({ amount: 1200, txId: '3' })
    // 見込み（記録済みではない）には txId がない
    expect(byLabel['駐輪場（固定費の見込み）']).toMatchObject({ amount: 400, estimate: true })
    expect(byLabel['駐輪場（固定費の見込み）'].txId).toBeUndefined()
    expect(byLabel['修繕積立（予定の出費の残り）']).toMatchObject({ amount: 12000, estimate: true })
  })

  it('固定費の実額（支出）が入力済みなら、見込みは中身に出ず、実額が出る', () => {
    const fixed: FixedCost = { id: 'f', name: '管理費', amount: 9760, day: 27, methodId: 'k' }
    const actual = tx('9', '2026-10-27', 9800, 'k', '', { category: '固定費', fixedCostId: 'f' })
    const flows = outflows('2026-10-27', [cash], [actual], [fixed], [cycle])
    const items = flows.flatMap((f) => f.items)
    expect(items.map((i) => [i.label, i.amount, i.estimate])).toEqual([['管理費', 9800, false]]) // 固定費の名前で出る
  })

  it('クレジットの請求の中身は、その引落にまとまる利用分', () => {
    const txs = [tx('1', '2026-10-10', 3000, 'c', 'スーパー'), tx('2', '2026-10-20', 4500, 'c', 'ドラッグストア')]
    const flows = outflows('2026-10-27', [card], txs, [], [])
    const bill = flows.find((f) => f.paymentDate === '2026-11-26')!
    expect(bill.items.map((i) => [i.date, i.label, i.amount])).toEqual([
      ['2026-10-10', 'スーパー', 3000],
      ['2026-10-20', 'ドラッグストア', 4500],
    ])
    expect(bill.amount).toBe(7500)
  })
})
