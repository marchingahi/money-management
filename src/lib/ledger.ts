import { cycleEvents, isSettled, type CycleCashflow } from './budget'
import type { Account, Adjustment, Settings, Transfer, YMD } from './types'

/**
 * 口座ごとの残高の推移。入力した残高から、そのあとの入出金・振替・調整を日付順に足し引きして、
 * 各時点の残高を出す。どこで実際の残高とずれたかを追えるようにするためのもの。
 */
export interface LedgerEntry {
  key: string
  date: YMD
  label: string
  /** 残高に足す額（出金はマイナス） */
  amount: number
  /** 残高を入力した時点ですでに残高に含まれているため、足し引きしない（推移には出すが、残高は動かさない） */
  settled: boolean
  /** この入出金を反映したあとの残高 */
  balance: number
  /** 残高の調整（微調整）の ID。編集・削除に使う */
  adjustmentId?: string
}

export interface Ledger {
  account: Account & { id: string }
  /** 入力した残高（起点） */
  base: { date: YMD; balance: number }
  entries: LedgerEntry[]
}

/**
 * cashflows は、残高を入力した日を含むサイクルから始まる、連続したサイクルの収支。
 * 残高が未入力の口座は null。
 */
export function accountLedger(
  account: Account & { id: string },
  accounts: Account[],
  cashflows: CycleCashflow[],
  settings: Settings,
  transfers: Transfer[] = [],
  adjustments: Adjustment[] = [],
): Ledger | null {
  if (account.balance == null || !account.balanceDate) return null
  let balance = account.balance
  const entries: LedgerEntry[] = []
  for (const cf of cashflows) {
    for (const e of cycleEvents(cf, accounts, settings, transfers, adjustments)) {
      if (e.accountId !== account.id) continue
      const settled = isSettled(e, account)
      if (!settled) balance += e.amount
      entries.push({
        key: e.key,
        date: e.settleDate ?? e.date,
        label: e.label,
        amount: e.amount,
        settled,
        balance,
        ...(e.key.startsWith('adjust:') && { adjustmentId: e.key.slice('adjust:'.length) }),
      })
    }
  }
  return { account, base: { date: account.balanceDate, balance: account.balance }, entries }
}

/** 指定した日（当日の入出金を含む）の終わりの、予想の残高。起点より前なら、入力した残高 */
export function expectedBalanceOn(ledger: Ledger, date: YMD): number {
  let balance = ledger.base.balance
  for (const e of ledger.entries) {
    if (e.date > date) break
    balance = e.balance
  }
  return balance
}
