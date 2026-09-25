import { useState } from 'react'
import { todayYMD } from '../lib/dates'
import type { Settings } from '../lib/types'
import { repo } from '../repo'

interface Props {
  settings: Settings
  onClose: () => void
}

/** 口座残高の入力。この日までの入出金は残高に反映済みとして、それ以降の予定から繰越を計算する */
export function BalanceForm({ settings, onClose }: Props) {
  const [amount, setAmount] = useState(settings.balance != null ? String(Math.abs(settings.balance)) : '')
  const [negative, setNegative] = useState((settings.balance ?? 0) < 0)
  const [date, setDate] = useState(todayYMD())
  const value = Number(amount || 0) * (negative ? -1 : 1)

  const save = async () => {
    await repo.update('settings', 'main', { balance: value, balanceDate: date })
    onClose()
  }

  const clear = async () => {
    await repo.update('settings', 'main', { balance: undefined, balanceDate: undefined })
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="口座残高の入力">
        <div className="sheet-head">
          <h2>口座残高</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="muted small">
          引き落としや給料が入る口座の、今の残高を入れてください（複数の口座なら合計）。入力した日までの給料・引落・支払いは残高に反映済みとして、それより後の予定から繰越を計算します。
        </p>

        <label className={`amount-field ${negative ? 'refund' : ''}`}>
          <span>{negative ? '−¥' : '¥'}</span>
          <input
            inputMode="numeric"
            placeholder="0"
            value={amount ? Number(amount).toLocaleString('ja-JP') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus
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

        <div className="sheet-actions">
          {settings.balance != null && (
            <button className="btn" onClick={clear}>
              残高を使わない
            </button>
          )}
          <button className="btn primary" disabled={!amount} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
