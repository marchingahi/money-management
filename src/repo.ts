import { asRecords, db, tableOf, TABLES, type AnyRecord, type Records, type TableName } from './db'
import type { DataSet } from './lib/legacy'

/*
 * データの書き込みはすべてここを通す。
 * 変更したレコードに「未送信」の印と変更時刻を付け、同期処理に知らせる。
 */

type Listener = () => void
const listeners = new Set<Listener>()
export const onLocalChange = (fn: Listener) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const notify = () => listeners.forEach((fn) => fn())

const newId = () => crypto.randomUUID()
const touched = () => ({ _dirty: 1 as const, _modifiedAt: Date.now() })

type Row<K extends TableName> = Records[K]

async function add<K extends TableName>(table: K, value: Row<K>): Promise<string> {
  const id = value.id ?? newId()
  await tableOf(table).put({ ...value, id, ...touched() })
  notify()
  return id
}

async function bulkAdd<K extends TableName>(table: K, values: Row<K>[]) {
  const t = touched()
  await tableOf(table).bulkPut(asRecords(values).map((v) => ({ ...v, id: v.id ?? newId(), ...t })))
  notify()
}

async function put<K extends TableName>(table: K, value: Row<K> & { id: string }) {
  const { deleted: _x, ...rest } = value as unknown as AnyRecord
  await tableOf(table).put({ ...rest, ...touched() })
  notify()
}

async function update<K extends TableName>(table: K, id: string, changes: Partial<Row<K>>) {
  // undefined を渡した項目は削除される（Dexie の update の仕様）
  await tableOf(table).update(id, { ...changes, ...touched() })
  notify()
}

/** 削除も他の端末に伝えるため、中身を消して削除済みの印だけ残す */
async function remove(table: TableName, id: string) {
  await tableOf(table).put({ id, deleted: 1, ...touched() })
  notify()
}

/** データ全体を置き換える（バックアップからの復元） */
async function replaceAll(data: DataSet) {
  const t = touched()
  await db.transaction('rw', TABLES.map(tableOf), async () => {
    for (const name of TABLES) {
      const incoming = asRecords(data[name])
      const keep = new Set(incoming.map((r) => r.id))
      const existing = await tableOf(name).toArray()
      const tombstones = existing
        .filter((r) => !r.deleted && !keep.has(r.id))
        .map((r) => ({ id: r.id, deleted: 1 as const, ...t }))
      await tableOf(name).bulkPut([...tombstones, ...incoming.map((r) => ({ ...r, id: r.id ?? newId(), ...t }))])
    }
  })
  notify()
}

export const repo = { add, bulkAdd, put, update, remove, replaceAll }
