import type { Account, PaymentMethod } from './types'

/**
 * 口座から直接引き落とされた・振り込んだ支出のための、口座ごとの支払い方法。
 * データには保存せず、口座から自動で用意する（口座を削除すれば消える）。
 * 口座から出るお金として扱うので、予算・口座残高・残高不足の判定に、既存の仕組みのまま反映される。
 */
export const ACCOUNT_METHOD_PREFIX = 'acct:'

export const accountMethodId = (accountId: string) => `${ACCOUNT_METHOD_PREFIX}${accountId}`

export const isAccountMethodId = (id: string) => id.startsWith(ACCOUNT_METHOD_PREFIX)

export function withAccountMethods<M extends PaymentMethod & { id: string }>(
  methods: M[],
  accounts: (Account & { id: string })[],
): (PaymentMethod & { id: string })[] {
  const base = Math.max(0, ...methods.map((m) => m.order))
  const virtual = accounts.map(
    (a, i): PaymentMethod & { id: string } => ({
      id: accountMethodId(a.id),
      name: `${a.name}（口座引落・振込）`,
      kind: 'debit',
      closingDay: 31,
      paymentDay: 31,
      monthOffset: 0,
      accountId: a.id,
      order: base + 1 + i,
      virtual: true,
    }),
  )
  return [...methods, ...virtual]
}
