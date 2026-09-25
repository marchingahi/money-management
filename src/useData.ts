import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { FixedCost, Member, PaymentMethod, Settings, Transaction } from './lib/types'

export interface AppData {
  settings: Settings
  members: Member[]
  methods: PaymentMethod[]
  fixedCosts: FixedCost[]
  transactions: Transaction[]
}

export function useData(): AppData | undefined {
  return useLiveQuery(async () => {
    const [settings, members, methods, fixedCosts, transactions] = await Promise.all([
      db.settings.get('main'),
      db.members.toArray(),
      db.methods.orderBy('order').toArray(),
      db.fixedCosts.toArray(),
      db.transactions.orderBy('date').reverse().toArray(),
    ])
    if (!settings) return undefined
    return { settings, members, methods, fixedCosts, transactions }
  })
}

export const yen = (n: number) => `${n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`

export const dayLabel = (d: number) => (d >= 31 ? '末日' : `${d}日`)
