import { useState } from 'react'
import type { AccountEvent } from '../lib/budget'
import { formatMD, todayYMD } from '../lib/dates'
import type { Account, YMD } from '../lib/types'
import { repo } from '../repo'
import { yen } from '../useData'

interface Props {
  /** 編集する口座。id がなければ新しい口座を作る */
  account: Account
  /** その口座の、指定日の入出金の予定 */
  eventsOn: (date: YMD, accountId?: string) => AccountEvent[]
  onClose: () => void
}

/**
 * 口座残高の入力。入力日より前の予定は残高に反映済みとし、
 * 入力日当日の予定は、反映済みかどうかを 1 件ずつ選べるようにする。
 */
export function BalanceForm({ account, eventsOn, onClose }: Props) {
  const isNew = account.id == null
  const [name, setName] = useState(account.name)
  const [amount, setAmount] = useState(account.balance != null ? String(Math.abs(account.balance)) : '')
  const [negative, setNegative] = useState((account.balance ?? 0) < 0)
  const [date, setDate] = useState(todayYMD())
  const [unsettled, setUnsettled] = useState<string[]>(
    account.balanceDate === todayYMD() ? (account.unsettled ?? []) : [],
  )
  const value = Number(amount || 0) * (negative ? -1 : 1)
  const sameDay = eventsOn(date, account.id)

  const toggle = (key: string) =>
    setUnsettled(unsettled.includes(key) ? unsettled.filter((k) => k !== key) : [...unsettled, key])

  const save = async () => {
    const fields = {
      name: name.trim(),
      balance: value,
      balanceDate: date,
      unsettled: unsettled.filter((k) => sameDay.some((e) => e.key === k)),
    }
    if (isNew) await repo.add('accounts', { ...account, ...fields })
    else await repo.update('accounts', account.id!, fields)
    onClose()
  }

  const clear = async () => {
    await repo.update('accounts', account.id!, { balance: undefined, balanceDate: undefined, unsettled: undefined })
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="口座残高の入力">
        <div className="sheet-head">
          <h2>{isNew ? '口座を追加' : `${account.name}の残高`}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        {isNew && (
          <label className="field">
            <span className="field-label">口座の名前</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 三井住友（自分）" autoFocus />
          </label>
        )}

        <label className={`amount-field ${negative ? 'refund' : ''}`}>
          <span>{negative ? '−¥' : '¥'}</span>
          <input
            inputMode="numeric"
            placeholder="今の残高"
            value={amount ? Number(amount).toLocaleString('ja-JP') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus={!isNew}
          />
        </label>
        <div className="chips refund-toggle">
          <button className={`chip ${negative ? 'on' : ''}`} onClick={() => setNegative(!negative)}>
            マイナス
          </button>
        </div>

        <label className="field">
          <span className="field-label">いつ時点の残高か</span>
          <input type="date" value={date} max={todayYMD()} onChange={(e) => setDate(e.target.value || todayYMD())} />
        </label>

        {sameDay.length > 0 && (
          <div className="field">
            <span className="field-label">
              {formatMD(date)}の予定のうち、この残高にもう入っているもの（まだならチェックを外す）
            </span>
            <ul className="list settle-list">
              {sameDay.map((e) => (
                <li key={e.key}>
                  <label className="settle-item">
                    <input
                      type="checkbox"
                      checked={!unsettled.includes(e.key)}
                      onChange={() => toggle(e.key)}
                    />
                    <span className="grow">{e.label}</span>
                    <span className="amount">{e.amount > 0 ? `+${yen(e.amount)}` : yen(e.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="muted small">{formatMD(date)}より前の入出金は、この残高に入っているものとして計算します。</p>

        <div className="sheet-actions">
          {!isNew && account.balance != null && (
            <button className="btn" onClick={clear}>
              残高を使わない
            </button>
          )}
          <button className="btn primary" disabled={!amount || !name.trim()} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
