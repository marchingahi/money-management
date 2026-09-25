import { describe, expect, it } from 'vitest'
import { convertLegacy, type LegacyData } from './legacy'
import { newMember } from './seed'

const legacy: LegacyData = {
  members: [
    { ...newMember('自分'), id: 1, takeHome: 250000 },
    { ...newMember('妻'), id: 2 },
  ],
  incomes: [{ id: 1, memberId: 2, cycleStart: '2026-09-25', amount: 90000 }],
  methods: [
    { id: 1, name: 'Olive', kind: 'credit', closingDay: 31, paymentDay: 26, monthOffset: 1, order: 1, ownerId: 1 },
    // 3〜8 は旧端末で削除済み
    { id: 2, name: 'PayPayカード', kind: 'credit', closingDay: 31, paymentDay: 27, monthOffset: 1, order: 2 },
    { id: 9, name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 9 },
    { id: 10, name: '楽天カード', kind: 'credit', closingDay: 31, paymentDay: 27, monthOffset: 1, order: 10 },
  ],
  fixedCosts: [{ id: 1, name: '電気', amount: 8000, day: 5, methodId: 10 }],
  transactions: [
    { id: 1, date: '2026-09-01', amount: 1000, category: '食費', methodId: 10, memo: '' },
    { id: 2, date: '2026-09-05', amount: 8100, category: '固定費', methodId: 10, memo: '', fixedCostId: 1, importKey: 'k#1' },
  ],
  settings: [{ id: 'main', cycleStartDay: 25, savings: 10000 }],
}

describe('convertLegacy', () => {
  let n = 0
  const { data, deletedSeedIds } = convertLegacy(legacy, () => `u${++n}`)

  it('初期データ由来の ID は固定 ID に、それ以外は新しい ID にし、参照も付け替える', () => {
    expect(data.members.map((m) => m.id)).toEqual(['p-1', 'p-2'])
    expect(data.methods.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-9', 'u1'])
    expect(data.methods[0].ownerId).toBe('p-1')
    expect(data.fixedCosts).toEqual([{ id: 'u2', name: '電気', amount: 8000, day: 5, methodId: 'u1' }])
    expect(data.transactions.map((t) => [t.methodId, t.fixedCostId, t.importKey])).toEqual([
      ['u1', undefined, undefined],
      ['u1', 'u2', 'k#1'],
    ])
    expect(data.incomes[0].memberId).toBe('p-2')
    expect(data.settings).toEqual(legacy.settings)
  })

  it('旧端末で削除された初期データを削除済みとして伝える', () => {
    expect(deletedSeedIds).toEqual({ members: [], methods: ['m-3', 'm-4', 'm-5', 'm-6', 'm-7', 'm-8'] })
  })
})
