import { describe, expect, it } from 'vitest'
import { isDemo, setDemo } from '../demoMode'
import { repo } from '../repo'
import { budgetIncomeCycle, cashflowFor, outflows, projectAccounts, summarize } from './budget'
import { buildDemoData } from './demo'
import { cycleOf, cycleRule, shiftCycle } from './dates'

const TODAY = '2026-11-05'

describe('デモ表示のサンプルデータ', () => {
  const d = buildDemoData(TODAY)

  it('同じ日なら毎回同じ内容になる', () => {
    expect(buildDemoData(TODAY)).toEqual(d)
    expect(buildDemoData('2026-11-06')).not.toEqual(d)
  })

  it('IDは重複せず、参照先（支払い方法・口座・固定費）がすべて存在する', () => {
    const ids = [d.members, d.accounts, d.methods, d.fixedCosts, d.transactions, d.incomes, d.planned, d.transfers, d.extraIncomes].flatMap((l) => l.map((x) => x.id))
    expect(new Set(ids).size).toBe(ids.length)
    const methodIds = new Set(d.methods.map((m) => m.id))
    const accountIds = new Set([...d.accounts.map((a) => a.id), 'none'])
    expect(d.transactions.every((t) => methodIds.has(t.methodId))).toBe(true)
    expect(d.fixedCosts.every((f) => methodIds.has(f.methodId) && (!f.accountId || accountIds.has(f.accountId)))).toBe(true)
    expect(d.methods.every((m) => !m.accountId || accountIds.has(m.accountId))).toBe(true)
    const fixedIds = new Set(d.fixedCosts.map((f) => f.id))
    expect(d.transactions.every((t) => !t.fixedCostId || fixedIds.has(t.fixedCostId))).toBe(true)
  })

  it('未来の日付の支出は作らない', () => {
    expect(d.transactions.every((t) => t.date <= TODAY)).toBe(true)
  })

  it('予算・給料ごとの残り・口座の繰越が、画面にふさわしい範囲で計算できる', () => {
    const rule = cycleRule(d.settings)
    const cycle = cycleOf(TODAY, rule)
    const incomeCycle = budgetIncomeCycle(cycle, d.settings)
    const s = summarize(cycle, TODAY, d.members, d.incomes, d.fixedCosts, d.transactions, d.settings, incomeCycle, d.planned, d.methods, d.extraIncomes)
    expect(s.income).toBe(440000)
    expect(s.remaining).toBeGreaterThan(0)
    expect(s.remaining).toBeLessThan(s.income)

    const cycles = [0, 1, 2].map((n) => shiftCycle(cycle, n, rule))
    const flows = outflows(TODAY, d.methods, d.transactions, d.fixedCosts, cycles, d.planned)
    const cfs = cycles.map((c) => cashflowFor(c, d.members, d.incomes, flows, d.settings, d.extraIncomes))
    const carries = projectAccounts(cfs, d.accounts, d.settings, d.transfers)!
    expect(carries).toHaveLength(3)
    expect(carries.every((c) => Number.isFinite(c.closing))).toBe(true)
  })

  it('実際のデータらしい名前（カード会社名・実在の口座名など）を含まない', () => {
    const text = JSON.stringify(d)
    for (const word of ['Olive', 'PayPay', 'セゾン', 'JAL', 'エポス', 'イオン', '住宅ローン', '埼玉', '青木', 'みずほ']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('デモ表示中は、実データを書き換えない', () => {
  it('書き込みは何もせずに戻る（データベースに触れない）', async () => {
    setDemo(true)
    expect(isDemo()).toBe(true)
    // データベースが使えないテスト環境で、触れば例外になる。何も起きなければ、書き込みは止まっている
    await expect(repo.add('transactions', { date: '2026-11-05', amount: 1, category: '食費', methodId: 'm', memo: '' })).resolves.toBe('demo')
    await expect(repo.put('transactions', { id: 'x', date: '2026-11-05', amount: 1, category: '食費', methodId: 'm', memo: '' })).resolves.toBeUndefined()
    await expect(repo.update('settings', 'main', { savings: 1 })).resolves.toBeUndefined()
    await expect(repo.remove('transactions', 'x')).resolves.toBeUndefined()
    await expect(repo.bulkAdd('transactions', [])).resolves.toBeUndefined()
    setDemo(false)
    expect(isDemo()).toBe(false)
  })
})
