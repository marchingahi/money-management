import { useState } from 'react'
import { todayYMD } from '../lib/dates'
import type { Account, Transfer } from '../lib/types'
import { repo } from '../repo'

interface Props {
  accounts: (Account & { id: string })[]
  /** 編集する振替、または新規作成時の初期値 */
  initial: Partial<Transfer>
  onClose: () => void
}

/** 口座間の振替の入力。家計全体のお金は増減せず、口座ごとの残高だけが動く */
export function TransferForm({ accounts, initial, onClose }: Props) {
  const editing = initial.id != null
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '')
  const [date, setDate] = useState(initial.date ?? todayYMD())
  const [from, setFrom] = useState(initial.fromAccountId ?? accounts[0]?.id ?? '')
  const [to, setTo] = useState(initial.toAccountId ?? accounts.find((a) => a.id !== from)?.id ?? '')
  const [memo, setMemo] = useState(initial.memo ?? '')
  const value = Number(amount || 0)
  const canSave = value > 0 && from && to && from !== to && date

  const save = async () => {
    if (!canSave) return
    const t: Transfer = { date, amount: value, fromAccountId: from, toAccountId: to, memo: memo.trim() }
    if (editing) await repo.put('transfers', { ...t, id: initial.id! })
    else await repo.add('transfers', t)
    onClose()
  }

  const remove = async () => {
    if (!editing || !confirm('この振替を削除しますか？')) return
    await repo.remove('transfers', initial.id!)
    onClose()
  }

  const select = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  )

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="口座間の振替">
        <div className="sheet-head">
          <h2>{editing ? '振替を編集' : '口座間の振替'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="muted small">
          自分の口座どうしでお金を移したときや、移す予定を記録します。家計全体の残りは変わらず、口座ごとの残高だけが変わります。
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
            <span className="field-label">出金する口座</span>
            {select(from, setFrom)}
          </label>
          <label className="field">
            <span className="field-label">入金する口座</span>
            {select(to, setTo)}
          </label>
        </div>
        {from && from === to && <p className="error">出金と入金に同じ口座は選べません</p>}

        <div className="row2">
          <label className="field">
            <span className="field-label">振替日（予定日でも可）</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">メモ</span>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="任意" />
          </label>
        </div>

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
