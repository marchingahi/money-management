import { describe, expect, it } from 'vitest'
import { billingOf } from './billing'
import { summarize } from './budget'
import { cycleOf } from './dates'
import { guessMethod, parseSheet, planImport, toDate, toPaymentMonth } from './excelImport'
import type { PaymentMethod } from './types'

const credit = (id: number, name: string, closingDay: number, paymentDay: number): PaymentMethod => ({
  id: String(id),
  name,
  kind: 'credit',
  closingDay,
  paymentDay,
  monthOffset: 1,
  order: id,
})
const methods: PaymentMethod[] = [
  credit(1, 'Olive', 31, 26),
  credit(2, 'PayPayカード', 31, 27),
  credit(3, 'セゾン', 10, 4),
  credit(4, 'JAL', 15, 10),
  credit(5, 'JCB W', 15, 10),
  credit(6, 'エポス', 4, 4),
  credit(7, 'ルミネ', 5, 4),
  credit(8, 'イオン', 10, 2),
  { id: '9', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 9 },
]

// 2026-04-05 のシリアル値
const APR5 = 46117

describe('値の変換', () => {
  it('日付', () => {
    expect(toDate(APR5)).toBe('2026-04-05')
    expect(toDate('2026/4/5')).toBe('2026-04-05')
    expect(toDate('2026年4月5日')).toBe('2026-04-05')
    expect(toDate(null)).toBeUndefined()
  })

  it('支払月は利用日以降で最初のその月', () => {
    expect(toPaymentMonth(6, '2026-04-05')).toBe('2026-06')
    expect(toPaymentMonth(1, '2026-11-05')).toBe('2027-01')
    expect(toPaymentMonth('', '2026-11-05')).toBeUndefined()
  })
})

describe('guessMethod', () => {
  it.each([
    ['EPOSカード', '6'],
    ['JALカード', '4'],
    ['LUMINEカード', '7'],
    ['Olive', '1'],
    ['PayPay', '2'],
    ['SAISON', '3'],
    ['JCB W', '5'],
    ['現金', '9'],
    ['楽天カード', undefined],
  ])('%s → %s', (name, id) => {
    expect(guessMethod(name, methods)).toBe(id)
  })
})

describe('parseSheet / planImport', () => {
  const table = [
    ['日付', '支払月', '支払方法', '金額', '固定', '締め日', '店名', '明細照合', '照合メモ'],
    [APR5, 6, 'EPOSカード', 1936, null, 4, null, '照合済', 'ＡＭＡＺＯＮ．ＣＯ．ＪＰ'],
    [APR5, 6, 'EPOSカード', 40000, '固定', 4, null, '未着', ''],
    [APR5, 6, 'EPOSカード', 40000, '固定', 4, null, '未着', ''], // 同内容の2行目も別の支出
    [46173, 7, 'PayPay', 3000, '固定', 31, null, '', ''], // 5/31 の固定費が翌々月請求
    [46173, 6, 'PayPay', -500, null, 31, null, '', ''], // 返金
    [null, null, null, null, null, '', null, '', ''],
    [APR5, 6, null, 800, null, '', null, '', ''],
  ]

  it('行を読み取り、空行は無視し、欠けている行は理由付きでスキップ', () => {
    const { rows, skipped } = parseSheet(table)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toEqual({
      row: 2,
      date: '2026-04-05',
      paymentMonth: '2026-06',
      methodName: 'EPOSカード',
      amount: 1936,
      fixed: false,
      memo: 'AMAZON.CO.JP',
    })
    expect(skipped).toEqual([{ row: 8, reason: '支払方法がありません' }])
  })

  it('見出しがなければエラー', () => {
    expect(() => parseSheet([['a', 'b']])).toThrow('見出し行')
  })

  it('取り込み計画: 固定費カテゴリ・ずれた支払月の保持・重複除外', () => {
    const { rows } = parseSheet(table)
    const mapping = Object.fromEntries(rows.map((r) => [r.methodName, guessMethod(r.methodName, methods)]))
    const plan = planImport(rows, mapping, methods, new Set())
    expect(plan.transactions.map((t) => [t.category, t.amount, t.paymentMonth ?? null])).toEqual([
      ['未分類', 1936, null],
      ['固定費', 40000, null],
      ['固定費', 40000, null],
      ['固定費', 3000, '2026-07'],
      ['未分類', -500, null],
    ])
    expect(billingOf('2026-05-31', methods[1], '2026-07').paymentDate).toBe('2026-07-27')

    const again = planImport(rows, mapping, methods, new Set(plan.transactions.map((t) => t.importKey!)))
    expect(again).toEqual({ transactions: [], duplicates: 5 })
  })

  it('取り込んだ固定費カテゴリは普段の支出ではなく固定費として集計', () => {
    const { rows } = parseSheet(table)
    const mapping = Object.fromEntries(rows.map((r) => [r.methodName, guessMethod(r.methodName, methods)]))
    const txs = planImport(rows, mapping, methods, new Set()).transactions
    const s = summarize(cycleOf('2026-04-05', 25), '2026-04-05', [], [], [], txs, {
      id: 'main',
      cycleStartDay: 25,
      savings: 0,
    })
    expect(s.fixedTotal).toBe(80000)
    expect(s.spent).toBe(1936)
  })
})
