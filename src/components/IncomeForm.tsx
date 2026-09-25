import { useState } from 'react'
import { db } from '../db'
import { repo } from '../repo'
import type { IncomeStatus } from '../lib/budget'
import { formatMD, type Cycle } from '../lib/dates'
import { yen } from '../useData'

interface Props {
  status: IncomeStatus
  cycle: Cycle
  onClose: () => void
}

/** サイクルごとの実際の手取り額を入力する */
export function IncomeForm({ status, cycle, onClose }: Props) {
  const { member, estimate, actual } = status
  const [amount, setAmount] = useState(String(actual ?? estimate))
  const value = Number(amount || 0)

  const findRecord = () =>
    db.incomes
      .where('memberId')
      .equals(member.id!)
      .filter((i) => i.cycleStart === cycle.start && !i.deleted)
      .first()

  const save = async () => {
    const existing = await findRecord()
    if (existing) await repo.update('incomes', existing.id, { amount: value })
    // 人×サイクルで決まる ID にして、別の端末で同じ月を入力しても 1 件にまとまるようにする
    else {
      const id = `${member.id}@${cycle.start}`
      await repo.put('incomes', { id, memberId: member.id!, cycleStart: cycle.start, amount: value })
    }
    onClose()
  }

  const clear = async () => {
    const existing = await findRecord()
    if (existing) await repo.remove('incomes', existing.id)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="手取りの入力">
        <div className="sheet-head">
          <h2>{member.name}の手取り</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="muted small">
          {formatMD(cycle.start)} 〜 {formatMD(cycle.end)} のサイクルに振り込まれた（振り込まれる）手取り額
        </p>

        <label className="amount-field">
          <span>¥</span>
          <input
            inputMode="numeric"
            value={amount ? value.toLocaleString('ja-JP') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus
          />
        </label>
        <p className="hint">見込み {yen(estimate)}（設定の値から計算）</p>

        <div className="sheet-actions">
          {actual != null && (
            <button className="btn" onClick={clear}>
              見込みに戻す
            </button>
          )}
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
