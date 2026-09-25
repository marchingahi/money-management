import Dexie, { type EntityTable } from 'dexie'
import type { FixedCost, Member, PaymentMethod, Settings, Transaction } from './lib/types'

export const db = new Dexie('money-management') as Dexie & {
  members: EntityTable<Member, 'id'>
  methods: EntityTable<PaymentMethod, 'id'>
  fixedCosts: EntityTable<FixedCost, 'id'>
  transactions: EntityTable<Transaction, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  members: '++id',
  methods: '++id, order',
  fixedCosts: '++id',
  transactions: '++id, date, methodId, fixedCostId',
  settings: 'id',
})

const credit = (name: string, closingDay: number, paymentDay: number, order: number): PaymentMethod => ({
  name,
  kind: 'credit',
  closingDay,
  paymentDay,
  monthOffset: 1,
  order,
})

/** 初回起動時の初期データ（締め日 31 = 月末） */
db.on('populate', (tx) => {
  tx.table('settings').add({ id: 'main', cycleStartDay: 25, savings: 0 } satisfies Settings)
  tx.table('members').bulkAdd([
    { name: '自分', payday: 25, takeHome: 0 },
    { name: '妻', payday: 25, takeHome: 0 },
  ] satisfies Member[])
  tx.table('methods').bulkAdd([
    credit('Olive', 31, 26, 1),
    credit('PayPayカード', 31, 27, 2),
    credit('セゾン', 10, 4, 3),
    credit('JAL', 15, 10, 4),
    credit('JCB W', 15, 10, 5),
    credit('エポス', 4, 4, 6),
    credit('ルミネ', 5, 4, 7),
    credit('イオン', 10, 2, 8),
    { name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 9 },
  ] satisfies PaymentMethod[])
})

export interface Backup {
  version: 1
  exportedAt: string
  members: Member[]
  methods: PaymentMethod[]
  fixedCosts: FixedCost[]
  transactions: Transaction[]
  settings: Settings[]
}

export async function exportBackup(): Promise<Backup> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    members: await db.members.toArray(),
    methods: await db.methods.toArray(),
    fixedCosts: await db.fixedCosts.toArray(),
    transactions: await db.transactions.toArray(),
    settings: await db.settings.toArray(),
  }
}

export async function importBackup(data: Backup) {
  if (data.version !== 1) throw new Error('対応していないバックアップ形式です')
  const tables = [db.members, db.methods, db.fixedCosts, db.transactions, db.settings]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await db.members.bulkAdd(data.members)
    await db.methods.bulkAdd(data.methods)
    await db.fixedCosts.bulkAdd(data.fixedCosts)
    await db.transactions.bulkAdd(data.transactions)
    await db.settings.bulkAdd(data.settings)
  })
}
