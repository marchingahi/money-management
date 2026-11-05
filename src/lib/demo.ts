import { addDays } from 'date-fns'
import type { AppData } from '../useData'
import { cycleOf, cycleRule, fromYMD, shiftCycle, toYMD } from './dates'
import {
  CATEGORIES,
  FIXED_CATEGORY,
  type Account,
  type ExtraIncome,
  type FixedCost,
  type Income,
  type Member,
  type PaymentMethod,
  type PlannedExpense,
  type Settings,
  type Transaction,
  type Transfer,
  type YMD,
} from './types'

/*
 * デモ表示用の架空のデータ。実際のデータには一切つながらず、名前・金額・メモはすべてこのファイルの内容。
 * 同じ日なら毎回同じ内容になるよう、乱数は日付から決める。
 */

/** 小さな疑似乱数（mulberry32）。シードが同じなら同じ並びになる */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)

const meta = { _dirty: 0 as const, _modifiedAt: 0 }

/** 日常の支出のひな形（店名・カテゴリ・支払い方法・金額の幅・出やすさ） */
const SPENDING: { memo: string; category: (typeof CATEGORIES)[number]; methodId: string; min: number; max: number; weight: number }[] = [
  { memo: 'スーパー', category: '食費', methodId: 'demo-card1', min: 900, max: 6800, weight: 6 },
  { memo: 'コンビニ', category: '食費', methodId: 'demo-qr', min: 220, max: 980, weight: 4 },
  { memo: 'ドラッグストア', category: '日用品', methodId: 'demo-card1', min: 500, max: 3600, weight: 2 },
  { memo: 'ランチ', category: '外食', methodId: 'demo-cash', min: 700, max: 1500, weight: 3 },
  { memo: 'カフェ', category: '外食', methodId: 'demo-qr', min: 380, max: 900, weight: 2 },
  { memo: '電車・バス', category: '交通', methodId: 'demo-qr', min: 200, max: 1300, weight: 3 },
  { memo: '書籍', category: '娯楽', methodId: 'demo-card2', min: 900, max: 2600, weight: 1 },
  { memo: '衣料品', category: '衣服・美容', methodId: 'demo-card2', min: 2500, max: 9800, weight: 0.5 },
]
const TOTAL_WEIGHT = SPENDING.reduce((s, x) => s + x.weight, 0)

export function buildDemoData(today: YMD): AppData {
  const settings: Settings = {
    id: 'main',
    cycleStartDay: 25,
    savings: 30000,
    budgetIncome: 'next',
    cycleStartBusinessDay: true,
    cashflowInitial: 'current',
  }
  const rule = cycleRule(settings)
  const cycle = cycleOf(today, rule)
  const yesterday = toYMD(addDays(fromYMD(today), -1))

  const members: Member[] = [
    { id: 'demo-p1', name: '自分', payday: 25, payType: 'monthly', takeHome: 280000, hourlyWage: 0, hoursPerDay: 0, daysPerMonth: 0, deductionRate: 0, accountId: 'demo-a1' },
    { id: 'demo-p2', name: 'パートナー', payday: 25, payType: 'monthly', takeHome: 160000, hourlyWage: 0, hoursPerDay: 0, daysPerMonth: 0, deductionRate: 0, accountId: 'demo-a1' },
  ]
  const accounts: Account[] = [
    { id: 'demo-a1', name: '給与口座', order: 1, balance: 468000, balanceDate: yesterday },
    { id: 'demo-a2', name: '生活費口座', order: 2, balance: 132000, balanceDate: yesterday },
  ]
  const methods: PaymentMethod[] = [
    { id: 'demo-card1', name: 'メインカード', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 1, accountId: 'demo-a1' },
    { id: 'demo-card2', name: 'サブカード', kind: 'credit', closingDay: 15, paymentDay: 10, monthOffset: 1, order: 2, accountId: 'demo-a2' },
    { id: 'demo-qr', name: 'QR決済', kind: 'qr', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 3, accountId: 'demo-a2' },
    { id: 'demo-debit', name: '口座引落', kind: 'debit', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 4, accountId: 'demo-a1' },
    { id: 'demo-cash', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 5, accountId: 'none' },
  ]
  const fixedCosts: FixedCost[] = [
    { id: 'demo-f1', name: '家賃', amount: 85000, day: 27, methodId: 'demo-debit', accountId: 'demo-a1' },
    { id: 'demo-f2', name: '光熱費', amount: 12000, day: 10, methodId: 'demo-card2' },
    { id: 'demo-f3', name: '通信費', amount: 8000, day: 15, methodId: 'demo-card1' },
    { id: 'demo-f4', name: '保険', amount: 15000, day: 25, methodId: 'demo-debit', accountId: 'demo-a1' },
  ]

  // 過去 3 サイクルと今サイクル
  const cycles = [-3, -2, -1, 0].map((n) => shiftCycle(cycle, n, rule))
  const incomes: Income[] = []
  const transactions: Transaction[] = []
  let seq = 0
  for (const c of cycles.slice(0, 3)) {
    for (const m of members) incomes.push({ id: `demo-i-${m.id}-${c.start}`, memberId: m.id!, cycleStart: c.start, amount: m.takeHome + (hash(c.start) % 7) * 1000 })
  }
  for (const c of cycles) {
    const rand = rng(hash(c.start))
    const last = c.end < today ? c.end : today
    for (let d = fromYMD(c.start); toYMD(d) <= last; d = addDays(d, 1)) {
      const count = rand() < 0.25 ? 0 : rand() < 0.65 ? 1 : 2
      for (let i = 0; i < count; i++) {
        let pick = rand() * TOTAL_WEIGHT
        const item = SPENDING.find((x) => (pick -= x.weight) < 0) ?? SPENDING[0]
        const amount = Math.round((item.min + rand() * (item.max - item.min)) / 10) * 10
        transactions.push({ id: `demo-t-${seq++}`, date: toYMD(d), amount, category: item.category, methodId: item.methodId, memo: item.memo })
      }
    }
    // 固定費の実額（利用日が今日までのもの）
    for (const f of fixedCosts) {
      const day = Math.min(f.day, 28)
      const base = fromYMD(c.start)
      let date = toYMD(new Date(base.getFullYear(), base.getMonth(), day))
      if (date < c.start) date = toYMD(new Date(base.getFullYear(), base.getMonth() + 1, day))
      if (date > today) continue
      const amount = f.id === 'demo-f2' ? 9800 + (hash(c.start + f.id) % 5) * 600 : f.amount
      transactions.push({ id: `demo-t-${seq++}`, date, amount, category: FIXED_CATEGORY, methodId: f.methodId, memo: f.name, fixedCostId: f.id })
    }
  }
  transactions.sort((a, b) => b.date.localeCompare(a.date))

  const planned: PlannedExpense[] = [
    {
      id: 'demo-pl1',
      name: '旅行',
      amount: 90000,
      date: toYMD(addDays(fromYMD(cycle.end), 75)),
      methodId: 'demo-card2',
      reserveFrom: cycle.start,
    },
  ]
  const transfers: Transfer[] = [
    { id: 'demo-tr1', date: toYMD(addDays(fromYMD(today), 2)), amount: 30000, fromAccountId: 'demo-a1', toAccountId: 'demo-a2', memo: '生活費へ' },
  ]
  const extraIncomes: ExtraIncome[] = [
    { id: 'demo-ex1', date: toYMD(addDays(fromYMD(today), 3)), amount: 20000, accountId: 'demo-a2', memo: '臨時収入（例）' },
  ]

  const withMeta = <T extends { id?: string }>(rows: T[]) => rows.map((r) => ({ ...r, ...meta }) as T & { id: string })
  return {
    settings: { ...settings, ...meta } as AppData['settings'],
    members: withMeta(members),
    incomes: withMeta(incomes),
    accounts: withMeta(accounts),
    transfers: withMeta(transfers),
    extraIncomes: withMeta(extraIncomes),
    planned: withMeta(planned),
    methods: withMeta(methods),
    fixedCosts: withMeta(fixedCosts),
    transactions: withMeta(transactions),
  }
}
