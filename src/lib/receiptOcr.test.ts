import { describe, expect, it } from 'vitest'
import { extractAmount, extractDate } from './receiptOcr'

describe('extractAmount', () => {
  it('「合計」の行にある金額を優先して読み取る', () => {
    const text = ['スーパーいちば', '2026/09/28', '小計　￥1,200', '消費税　￥120', '合計　￥1,320', 'お預り　￥2,000'].join('\n')
    expect(extractAmount(text)).toBe(1320)
  })

  it('手がかりの語がなければ、一番大きい金額らしき数値を採用する', () => {
    const text = ['コンビニ', '2026年9月28日', 'おにぎり　￥150', 'お茶　￥180', '￥330'].join('\n')
    expect(extractAmount(text)).toBe(330)
  })

  it('金額が読み取れなければ undefined', () => {
    expect(extractAmount('レシート\n読み取れませんでした')).toBeUndefined()
  })

  it('OCRが「¥」をバックスラッシュと誤認識しても読み取れる', () => {
    const text = ['スーパーいちば', '2026/09/29', 'おにぎり \\150', 'お茶 \\180', '合計 \\1,320'].join('\n')
    expect(extractAmount(text)).toBe(1320)
  })
})

describe('extractDate', () => {
  it('yyyy/mm/dd 形式の行から日付を読み取る', () => {
    expect(extractDate('スーパーいちば\n2026/09/28\n合計　￥1,320')).toBe('2026-09-28')
  })

  it('yyyy年mm月dd日 形式にも対応する', () => {
    expect(extractDate('コンビニ\n2026年9月28日\n合計　￥330')).toBe('2026-09-28')
  })

  it('日付が読み取れなければ undefined', () => {
    expect(extractDate('レシート\n合計　￥330')).toBeUndefined()
  })
})
