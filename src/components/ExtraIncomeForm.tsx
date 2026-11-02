import { useState } from 'react'
import { todayYMD } from '../lib/dates'
import type { Account, ExtraIncome } from '../lib/types'
import { repo } from '../repo'

interface Props {
  accounts: (Account & { id: string })[]
  /** 編集する臨時収入、または新規作成時の初期値 */
  initial: Partial<ExtraIncome>
  onClose: () => void
}

/** 臨時収入の入力。給料以外で、口座に直接入ったお金（または入る予定のお金）を記録する */
export function ExtraIncomeForm({ accounts, initial, onClose }: Props) {
  const editing = initial.id != null
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '')
  const [date, setDate] = useState(initial.date ?? todayYMD())
  const [accountId, setAccountId] = useState(initial.accountId ?? accounts[0]?.id ?? '')
  const [memo, setMemo] = useState(initial.memo ?? '')
  const value = Number(amount || 0)
  const account = accounts.find((a) => a.id === accountId)
  // 残高を入力した日（当日を含む）までの入金は、残高にすでに含まれているものとして口座残高には加えない
  const alreadyInBalance = !!(account?.balanceDate && date && date <= account.balanceDate)
  const canSave = value > 0 && accountId && date

  const save = async () => {
    if (!canSave) return
    const x: ExtraIncome = { date, amount: value, accountId, memo: memo.trim() }
    if (editing) await repo.put('extraIncomes', { ...x, id: initial.id! })
    else await repo.add('extraIncomes', x)
    onClose()
  }

  const remove = async () => {
    if (!editing || !confirm('この臨時収入を削除しますか？')) return
    await repo.remove('extraIncomes', initial.id!)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="臨時収入">
        <div className="sheet-head">
          <h2>{editing ? '臨時収入を編集' : '臨時収入を記録'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="muted small">
          ボーナス・還付金・臨時の振込など、給料以外で口座に直接入るお金を記録します。入金された口座の残高と、その期間の「給料ごとの残り」に加わります。
        </p>

        <label className="amount-field">
          <span>¥</span>
          <input
            inputMode="numeric"
            placeholder="0"
            value={amount ? Number(amount).toLocaleString('ja-JP') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus
          />
        </label>

        <div className="row2">
          <label className="field">
            <span className="field-label">入金される口座</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">入金日（予定日でも可）</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        {alreadyInBalance && (
          <p className="cf-warn">
            この日付は、{account?.name}の残高を入力した日（{account?.balanceDate}）以前です。入金済みで残高に含まれているものとして、口座の残高には加えません。残高に加えたいときは、入金日を残高入力日より後にしてください。
          </p>
        )}

        <label className="field">
          <span className="field-label">メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 還付金（任意）" />
        </label>

        <div className="sheet-actions">
          {editing && (
            <button className="btn danger" onClick={remove}>
              削除
            </button>
          )}
          <button className="btn primary" disabled={!canSave} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
