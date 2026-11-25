import { useState } from 'react'
import { todayYMD } from '../lib/dates'
import type { Account, Prepayment } from '../lib/types'
import { repo } from '../repo'
import { yen } from '../useData'

export interface BillInfo {
  /** 請求を区別するキー（`outflowKey`） */
  billKey: string
  methodName: string
  paymentDate: string
  /** 請求額 */
  amount: number
  /** この請求に、すでに登録済みの事前支払いの合計（編集中のものを除く） */
  paidOthers: number
}

interface Props {
  accounts: (Account & { id: string })[]
  bill: BillInfo
  /** 編集する事前支払い */
  initial?: Prepayment & { id: string }
  onClose: () => void
}

/**
 * カードの請求を、口座からの引落ではなく、ATMなどで事前に支払ったときの登録。
 * 登録した額の分は、引落日の口座からの引落がなくなる。支払い元に口座を選ぶと、支払った日にその口座から出金する。
 */
export function PrepaymentForm({ accounts, bill, initial, onClose }: Props) {
  const editing = initial != null
  const remaining = Math.max(bill.amount - bill.paidOthers, 0)
  const [amount, setAmount] = useState(String(initial?.amount ?? remaining))
  const [paidDate, setPaidDate] = useState(initial?.paidDate ?? todayYMD())
  const [accountId, setAccountId] = useState(initial?.accountId ?? '')
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const value = Number(amount || 0)
  const canSave = value > 0 && !!paidDate
  const debitLeft = Math.max(bill.amount - bill.paidOthers - value, 0)
  const sourceName = accounts.find((a) => a.id === accountId)?.name

  const save = async () => {
    if (!canSave) return
    const p: Prepayment = {
      billKey: bill.billKey,
      methodName: bill.methodName,
      paymentDate: bill.paymentDate,
      amount: value,
      paidDate,
      memo: memo.trim(),
      ...(accountId && { accountId }),
    }
    if (editing) await repo.put('prepayments', { ...p, id: initial.id })
    else await repo.add('prepayments', p)
    onClose()
  }

  const remove = async () => {
    if (!editing || !confirm('この事前支払いを削除しますか？（引落の予定が元に戻ります）')) return
    await repo.remove('prepayments', initial.id)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="事前に支払い">
        <div className="sheet-head">
          <h2>{editing ? '事前支払いを編集' : `${bill.methodName}を事前に支払い`}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="muted small">
          引落日（{bill.paymentDate}）の口座からの引落ではなく、ATMなどで事前に支払ったときに登録します。登録した額の分は、引落日の口座から引き落とされません。
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
            <span className="field-label">支払った日</span>
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">支払い元</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">口座を使わない</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}から出金
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">
          {sourceName
            ? `${sourceName}から、支払った日に出金します。引落日の口座からの引落は、その分なくなります。`
            : '現金などで支払ったとき。どの口座からも出金しません。引落日の口座からの引落だけが、その分なくなります。'}
        </p>

        <dl className="breakdown">
          <div>
            <dt>請求額（{bill.methodName}・{bill.paymentDate}引落）</dt>
            <dd>{yen(bill.amount)}</dd>
          </div>
          {bill.paidOthers > 0 && (
            <div className="sub">
              <dt>ほかの事前支払い</dt>
              <dd>−{yen(bill.paidOthers)}</dd>
            </div>
          )}
          <div className="total">
            <dt>引落日に引き落とされる額</dt>
            <dd>{yen(debitLeft)}</dd>
          </div>
        </dl>
        {value > bill.amount - bill.paidOthers && <p className="hint">請求額より多く支払っています（引落は 0 円になります）。</p>}

        <label className="field">
          <span className="field-label">メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: ATMで入金（任意）" />
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
