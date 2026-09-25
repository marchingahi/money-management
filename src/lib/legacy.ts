import { SEED_MEMBERS, SEED_METHODS, newMember } from './seed'
import type { FixedCost, Income, Member, PaymentMethod, Settings, Transaction } from './types'

/**
 * 旧形式（連番 ID）のデータを、同期できる文字列 ID の形式に変換する。
 * 端末内の旧データベースの移行と、旧形式のバックアップの復元で使う。
 */

/** ID と参照先 ID が連番だった旧形式 */
type Legacy<T, K extends keyof T = never> = Omit<T, 'id' | K> & { id?: number } & { [P in K]: number }

export interface LegacyData {
  members: Legacy<Member>[]
  incomes?: Legacy<Income, 'memberId'>[]
  methods: (Omit<PaymentMethod, 'id' | 'ownerId'> & { id?: number; ownerId?: number })[]
  fixedCosts: Legacy<FixedCost, 'methodId'>[]
  transactions: (Omit<Transaction, 'id' | 'methodId' | 'fixedCostId'> & {
    id?: number
    methodId: number
    fixedCostId?: number
  })[]
  settings: Settings[]
}

export interface DataSet {
  members: Member[]
  incomes: Income[]
  methods: PaymentMethod[]
  fixedCosts: FixedCost[]
  transactions: Transaction[]
  settings: Settings[]
}

export interface ConvertResult {
  data: DataSet
  /** 旧データに存在しない初期データの ID（旧端末で削除されたもの） */
  deletedSeedIds: { members: string[]; methods: string[] }
}

/** 初期データ由来の連番は固定 ID に、それ以外は新しい一意な ID にする */
function idMapper(prefix: string, seedCount: number, uuid: () => string) {
  const map = new Map<number, string>()
  return (n: number | undefined): string | undefined => {
    if (n == null) return undefined
    if (!map.has(n)) map.set(n, n <= seedCount ? `${prefix}-${n}` : uuid())
    return map.get(n)
  }
}

export function convertLegacy(legacy: LegacyData, uuid: () => string = () => crypto.randomUUID()): ConvertResult {
  const memberId = idMapper('p', SEED_MEMBERS.length, uuid)
  const methodId = idMapper('m', SEED_METHODS.length, uuid)
  const fixedId = idMapper('f', 0, uuid)

  const members = legacy.members.map((m) => ({ ...newMember(m.name), ...m, id: memberId(m.id)! }))
  const methods = legacy.methods.map((m) => ({ ...m, id: methodId(m.id)!, ownerId: memberId(m.ownerId) }))
  const fixedCosts = legacy.fixedCosts.map((f) => ({ ...f, id: fixedId(f.id)!, methodId: methodId(f.methodId)! }))
  const transactions = legacy.transactions.map((t) => ({
    ...t,
    id: uuid(),
    methodId: methodId(t.methodId)!,
    fixedCostId: fixedId(t.fixedCostId),
  }))
  const incomes = (legacy.incomes ?? []).map((i) => ({ ...i, id: uuid(), memberId: memberId(i.memberId)! }))

  const has = (list: { id?: string }[], id?: string) => list.some((x) => x.id === id)
  return {
    data: { members, incomes, methods, fixedCosts, transactions, settings: legacy.settings },
    deletedSeedIds: {
      members: SEED_MEMBERS.filter((s) => !has(members, s.id)).map((s) => s.id!),
      methods: SEED_METHODS.filter((s) => !has(methods, s.id)).map((s) => s.id!),
    },
  }
}
