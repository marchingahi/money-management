import { useState } from 'react'
import { cycleOf, formatMD, shiftCycle, todayYMD } from '../lib/dates'
import type { PaymentMethod, PlannedExpense } from '../lib/types'
import { db } from '../db'
import { repo } from '../repo'
import { yen } from '../useData'

interface Props {
  methods: (PaymentMethod & { id: string })[]
  startDay: number
  initial: Partial<PlannedExpense>
  onClose: () => void
}

/** 予定の出費の登録・編集。確保するサイクル数と 1 回あたりの額をその場で見せる */
export function PlannedForm({ methods, startDay, initial, onClose }: Props) {
  const editing = initial.id != null
  const [name, setName] = useState(initial.name ?? '')
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '')
  const [date, setDate] = useState(initial.date ?? '')
  const [methodId, setMethodId] = useState(initial.methodId ?? methods[0]?.id ?? '')
  const [reserveFrom, setReserveFrom] = useState(initial.reserveFrom ?? todayYMD())
  const [memo, setMemo] = useState(initial.memo ?? '')
  const value = Number(amount || 0)
  const canSave = name.trim() && value > 0 && date && methodId

  // 何回で確保するか（予定日のサイクルの前まで）
  let cycles = 0
  if (date) {
    const due = cycleOf(date, startDay)
    let c = cycleOf(reserveFrom < date ? reserveFrom : date, startDay)
    while (c.start < due.start && cycles < 120) {
      cycles++
      c = shiftCycle(c, 1, startDay)
    }
  }

  const save = async () => {
    if (!canSave) return
    const plan: PlannedExpense = {
      name: name.trim(),
      amount: value,
      date,
      methodId,
      reserveFrom,
      memo: memo.trim(),
      closedOn: initial.closedOn,
    }
    if (editing) await repo.put('planned', { ...plan, id: initial.id! })
    else await repo.add('planned', plan)
    onClose()
  }

  const remove = async () => {
    if (!editing || !confirm('この予定の出費を削除しますか？（支払いの記録は普段の支出として残ります）')) return
    await repo.remove('planned', initial.id!)
    // 紐付いていた支払いは普段の支出に戻す（紐付いたままだと予算に数えられなくなる）
    const linked = await db.transactions.filter((t) => t.plannedId === initial.id && !t.deleted).toArray()
    for (const t of linked) await repo.update('transactions', t.id, { plannedId: undefined })
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="予定の出費">
        <div className="sheet-head">
          <h2>{editing ? '予定の出費を編集' : '予定の出費を追加'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        <label className="field">
          <span className="field-label">内容</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 年末の帰省、車検、保険の年払い" autoFocus={!editing} />
        </label>

        <label className="amount-field">
          <span>¥</span>
          <input
            inputMode="numeric"
            placeholder="予定額"
            value={amount ? value.toLocaleString('ja-JP') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
          />
        </label>

        <div className="row2">
          <label className="field">
            <span className="field-label">支払う予定日</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">いつから確保するか</span>
            <input type="date" value={reserveFrom} onChange={(e) => setReserveFrom(e.target.value || todayYMD())} />
          </label>
        </div>

        <label className="field">
          <span className="field-label">支払い方法</span>
          <select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {date && value > 0 && (
          <p className="hint">
            {cycles > 0
              ? `${formatMD(date)}まで ${cycles}回に分けて、毎回 約${yen(Math.ceil(value / cycles))} を確保します`
              : '予定日が今のサイクル中なので、確保せずに今サイクルの予算から全額を引きます'}
          </p>
        )}

        <label className="field">
          <span className="field-label">メモ</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="任意" />
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
