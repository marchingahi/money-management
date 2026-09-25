import Dexie, { type EntityTable } from 'dexie'
import type { FixedCost, Income, Member, PaymentMethod, Settings, Transaction } from './lib/types'

export const db = new Dexie('money-management') as Dexie & {
  members: EntityTable<Member, 'id'>
  incomes: EntityTable<Income, 'id'>
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

// v2: 収入の見込み/実額対応（時給計算の項目を追加し、サイクルごとの実額を保持）
db.version(2)
  .stores({ incomes: '++id, memberId, cycleStart' })
  .upgrade((tx) =>
    tx
      .table('members')
      .toCollection()
      .modify((m: Member) => {
        m.payType ??= 'monthly'
        m.hourlyWage ??= 0
        m.hoursPerDay ??= 0
        m.daysPerMonth ??= 0
        m.deductionRate ??= 0
      }),
  )

export const newMember = (name: string, payType: Member['payType'] = 'monthly'): Member => ({
  name,
  payday: 25,
  payType,
  takeHome: 0,
  hourlyWage: 0,
  hoursPerDay: 0,
  daysPerMonth: 0,
  deductionRate: 0,
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
  tx.table('members').bulkAdd([newMember('自分'), newMember('妻', 'hourly')])
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
  /** v2 以降のバックアップにのみ含まれる */
  incomes?: Income[]
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
    incomes: await db.incomes.toArray(),
    methods: await db.methods.toArray(),
    fixedCosts: await db.fixedCosts.toArray(),
    transactions: await db.transactions.toArray(),
    settings: await db.settings.toArray(),
  }
}

export async function importBackup(data: Backup) {
  if (data.version !== 1) throw new Error('対応していないバックアップ形式です')
  const tables = [db.members, db.incomes, db.methods, db.fixedCosts, db.transactions, db.settings]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await db.members.bulkAdd(data.members.map((m) => ({ ...newMember(m.name), ...m })))
    await db.incomes.bulkAdd(data.incomes ?? [])
    await db.methods.bulkAdd(data.methods)
    await db.fixedCosts.bulkAdd(data.fixedCosts)
    await db.transactions.bulkAdd(data.transactions)
    await db.settings.bulkAdd(data.settings)
  })
}
