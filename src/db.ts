import Dexie, { type Table } from 'dexie'
import { convertLegacy, type DataSet, type LegacyData } from './lib/legacy'
import { SEED_MEMBERS, SEED_METHODS, SEED_SETTINGS } from './lib/seed'
import type { Account, FixedCost, Income, Member, PaymentMethod, Settings, Transaction } from './lib/types'

/** 同期のためにすべてのレコードが持つ項目 */
export interface SyncMeta {
  /** 未送信の変更がある */
  _dirty?: 0 | 1
  /** この端末で最後に変更した時刻（競合時は新しい方を採用） */
  _modifiedAt?: number
  /** 削除済み（削除も同期するため、レコードは印を付けて残す） */
  deleted?: 0 | 1
  /** サーバーに保存された時刻 */
  updatedAt?: number
}

type Stored<T> = T & SyncMeta & { id: string }

export const TABLES = ['members', 'incomes', 'accounts', 'methods', 'fixedCosts', 'transactions', 'settings'] as const
export type TableName = (typeof TABLES)[number]

export interface Records {
  members: Member
  incomes: Income
  accounts: Account
  methods: PaymentMethod
  fixedCosts: FixedCost
  transactions: Transaction
  settings: Settings
}

export type AppDB = Dexie & { [K in TableName]: Table<Stored<Records[K]>, string> } & {
  meta: Table<{ key: string; value: unknown }, string>
}

/*
 * v3 から ID を文字列にした（端末間で ID が衝突しないように）。
 * 主キーの型は変更できないので、別名のデータベースを作り、旧データベースから移行する。
 */
export const db = new Dexie('money-management-v3') as AppDB

/** テーブル名で汎用的に読み書きするとき用（型はレコード共通の形に揃える） */
export type AnyRecord = { id: string } & SyncMeta & Record<string, unknown>
export const tableOf = (name: TableName) => db.table<AnyRecord, string>(name)
/** アプリの型（Transaction など）を汎用レコードとして扱う */
export const asRecords = (rows: readonly unknown[]) => rows as AnyRecord[]

db.version(1).stores({
  members: 'id, _dirty',
  incomes: 'id, _dirty, memberId',
  methods: 'id, _dirty',
  fixedCosts: 'id, _dirty',
  transactions: 'id, _dirty, date, fixedCostId',
  settings: 'id, _dirty',
  meta: 'key',
})

/** 口座が 1 つだった頃に入れた残高を、最初の口座として移す（どの端末でも同じ ID になるようにする） */
export const LEGACY_ACCOUNT_ID = 'a-1'

// v2: 複数口座に対応
db.version(2)
  .stores({ accounts: 'id, _dirty' })
  .upgrade(async (tx) => {
    const settings = (await tx.table('settings').get('main')) as Settings | undefined
    if (settings?.balance == null || !settings.balanceDate) return
    await tx.table('accounts').put({
      id: LEGACY_ACCOUNT_ID,
      name: '口座',
      order: 1,
      balance: settings.balance,
      balanceDate: settings.balanceDate,
      _dirty: 1,
      _modifiedAt: 1,
    })
  })

/** 初期データは未送信扱いにせず、変更時刻も最古にする（クラウドのデータがあればそちらを優先） */
const seedMeta = { _dirty: 0, _modifiedAt: 0 } as const

db.on('populate', (tx) => {
  tx.table('settings').add({ ...SEED_SETTINGS, ...seedMeta })
  tx.table('members').bulkAdd(SEED_MEMBERS.map((m) => ({ ...m, ...seedMeta })))
  tx.table('methods').bulkAdd(SEED_METHODS.map((m) => ({ ...m, ...seedMeta })))
})

const LEGACY_DB = 'money-management'

/**
 * 旧データベース（連番 ID）があれば一度だけ移行する。旧データベースは念のため残す。
 * 移行したデータは送信対象にするが、変更時刻は最古にして、クラウドにある新しいデータを上書きしないようにする。
 */
export async function migrateLegacy() {
  if (await db.meta.get('legacyMigrated')) return
  if (!(await Dexie.exists(LEGACY_DB))) {
    await db.meta.put({ key: 'legacyMigrated', value: 'none' })
    return
  }
  const old = new Dexie(LEGACY_DB)
  await old.open()
  const read = async (name: string) =>
    old.tables.some((t) => t.name === name) ? await old.table(name).toArray() : []
  const legacy: LegacyData = {
    members: await read('members'),
    incomes: await read('incomes'),
    methods: await read('methods'),
    fixedCosts: await read('fixedCosts'),
    transactions: await read('transactions'),
    settings: await read('settings'),
  }
  old.close()

  const { data, deletedSeedIds } = convertLegacy(legacy)
  const meta = { _dirty: 1, _modifiedAt: 1 } as const
  await db.transaction('rw', [...TABLES.map((t) => db[t]), db.meta], async () => {
    for (const t of TABLES) {
      await tableOf(t).clear()
      await tableOf(t).bulkPut(asRecords(data[t]).map((r) => ({ ...r, ...meta })))
    }
    await db.members.bulkPut(deletedSeedIds.members.map((id) => ({ id, deleted: 1, ...meta }) as never))
    await db.methods.bulkPut(deletedSeedIds.methods.map((id) => ({ id, deleted: 1, ...meta }) as never))
    await db.meta.put({ key: 'legacyMigrated', value: new Date().toISOString() })
  })
}

export interface Backup extends DataSet {
  version: 2
  exportedAt: string
}

const strip = <T extends SyncMeta>(rows: T[]) =>
  rows
    .filter((r) => !r.deleted)
    .map(({ _dirty: _d, _modifiedAt: _m, deleted: _x, updatedAt: _u, ...rest }) => rest)

export async function exportBackup(): Promise<Backup> {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    members: strip(await db.members.toArray()),
    incomes: strip(await db.incomes.toArray()),
    accounts: strip(await db.accounts.toArray()),
    methods: strip(await db.methods.toArray()),
    fixedCosts: strip(await db.fixedCosts.toArray()),
    transactions: strip(await db.transactions.toArray()),
    settings: strip(await db.settings.toArray()),
  }
}

/** バックアップの内容に置き換える（旧形式のバックアップも読める） */
export function backupToDataSet(raw: unknown): DataSet {
  const data = raw as { version?: number }
  // 口座（accounts）がない頃の v2 バックアップにも対応
  if (data?.version === 2) return { ...(data as Backup), accounts: (data as Backup).accounts ?? [] }
  if (data?.version === 1) return convertLegacy(raw as LegacyData).data
  throw new Error('対応していないバックアップ形式です')
}
