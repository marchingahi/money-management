import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SyncMeta } from './db'
import type { Account, FixedCost, Income, Member, PaymentMethod, Settings, Transaction } from './lib/types'

type WithId<T> = T & { id: string }

export interface AppData {
  settings: Settings
  members: WithId<Member>[]
  incomes: WithId<Income>[]
  accounts: WithId<Account>[]
  methods: WithId<PaymentMethod>[]
  fixedCosts: WithId<FixedCost>[]
  transactions: WithId<Transaction>[]
}

const alive = <T extends SyncMeta>(rows: T[]) => rows.filter((r) => !r.deleted)

export function useData(): AppData | undefined {
  return useLiveQuery(async () => {
    const [settings, members, incomes, accounts, methods, fixedCosts, transactions] = await Promise.all([
      db.settings.get('main'),
      db.members.toArray(),
      db.incomes.toArray(),
      db.accounts.toArray(),
      db.methods.toArray(),
      db.fixedCosts.toArray(),
      db.transactions.orderBy('date').reverse().toArray(),
    ])
    if (!settings || settings.deleted) return undefined
    return {
      settings,
      members: alive(members),
      incomes: alive(incomes),
      accounts: alive(accounts).sort((a, b) => a.order - b.order),
      methods: alive(methods).sort((a, b) => a.order - b.order),
      fixedCosts: alive(fixedCosts),
      transactions: alive(transactions),
    }
  })
}

export const yen = (n: number) => `${n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`

export const dayLabel = (d: number) => (d >= 31 ? '末日' : `${d}日`)
