import { useState } from 'react'
import { repo } from '../repo'
import { billingOf } from '../lib/billing'
import { formatMD, todayYMD } from '../lib/dates'
import { CATEGORIES, FIXED_CATEGORY, type Transaction } from '../lib/types'
import type { AppData } from '../useData'

const LAST_METHOD_KEY = 'lastMethodId'

function loadLastMethod(): string | undefined {
  try {
    const v = localStorage.getItem(LAST_METHOD_KEY)
    return v ?? undefined
  } catch {
    return undefined
  }
}

interface Props {
  data: AppData
  initial?: Partial<Transaction>
  onClose: () => void
}

export function EntryForm({ data, initial, onClose }: Props) {
  const editing = initial?.id != null
  const lastMethod = loadLastMethod()
  const defaultMethod =
    initial?.methodId ?? data.methods.find((m) => m.id === lastMethod)?.id ?? data.methods[0]?.id

  const [amount, setAmount] = useState(initial?.amount ? String(Math.abs(initial.amount)) : '')
  const [refund, setRefund] = useState((initial?.amount ?? 0) < 0)
  const [date, setDate] = useState(initial?.date ?? todayYMD())
  const [methodId, setMethodId] = useState<string | undefined>(defaultMethod)
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0])
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const [fixedCostId, setFixedCostId] = useState<string | undefined>(initial?.fixedCostId)
  const [plannedId, setPlannedId] = useState<string | undefined>(initial?.plannedId)
  // 払い終わっていない予定の出費（一部払いを含む）＋この支出がすでに紐付いているもの
  const paidByPlan = new Map<string, number>()
  for (const t of data.transactions) {
    if (t.plannedId && t.id !== initial?.id) paidByPlan.set(t.plannedId, (paidByPlan.get(t.plannedId) ?? 0) + t.amount)
  }
  const openPlans = data.planned.filter(
    (p) => p.id === plannedId || (!p.closedOn && (paidByPlan.get(p.id) ?? 0) < p.amount),
  )

  const method = data.methods.find((m) => m.id === methodId)
  // 取り込み時の引落月指定は、利用日とカードが変わっていない間だけ有効
  const paymentMonth =
    initial?.paymentMonth && date === initial.date && methodId === initial.methodId ? initial.paymentMonth : undefined
  const billing = method && date ? billingOf(date, method, paymentMonth) : undefined
  const value = Number(amount.replace(/[^\d]/g, '')) * (refund ? -1 : 1)
  const canSave = value !== 0 && method && date
  const categoryChoices: string[] = [...CATEGORIES, FIXED_CATEGORY]
  if (!categoryChoices.includes(category)) categoryChoices.push(category)

  const choosePlanned = (id: string | undefined) => {
    setPlannedId(id)
    const plan = data.planned.find((p) => p.id === id)
    if (!plan) return
    setFixedCostId(undefined)
    if (category === FIXED_CATEGORY) setCategory('その他')
    setMethodId(plan.methodId)
    if (!memo) setMemo(plan.name)
    if (!amount) setAmount(String(plan.amount))
  }

  const chooseFixed = (id: string | undefined) => {
    setFixedCostId(id)
    if (id) setPlannedId(undefined)
    const fc = data.fixedCosts.find((f) => f.id === id)
    if (fc) {
      setMethodId(fc.methodId)
      setCategory(FIXED_CATEGORY)
      if (!memo) setMemo(fc.name)
    } else if (category === FIXED_CATEGORY) {
      setCategory(CATEGORIES[0])
    }
  }

  const save = async () => {
    if (!canSave) return
    const tx: Transaction = {
      date,
      amount: value,
      category,
      methodId: method.id!,
      memo: memo.trim(),
      fixedCostId,
      plannedId,
      paymentMonth,
      importKey: initial?.importKey,
    }
    if (editing) await repo.put('transactions', { ...tx, id: initial.id! })
    else await repo.add('transactions', tx)
    try {
      localStorage.setItem(LAST_METHOD_KEY, method.id!)
    } catch {
      // 保存できなくても入力自体は成功している
    }
    onClose()
  }

  const remove = async () => {
    if (!editing || !confirm('この支出を削除しますか？')) return
    await repo.remove('transactions', initial.id!)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="支出の入力">
        <div className="sheet-head">
          <h2>{editing ? '支出を編集' : '支出を入力'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        <label className={`amount-field ${refund ? 'refund' : ''}`}>
          <span>{refund ? '−¥' : '¥'}</span>
          <input
            inputMode="numeric"
            placeholder="0"
            value={amount ? Number(amount.replace(/[^\d]/g, '') || 0).toLocaleString('ja-JP') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus
          />
        </label>
        <div className="chips refund-toggle">
          <button className={`chip ${refund ? 'on' : ''}`} onClick={() => setRefund(!refund)}>
            返金・キャンセル
          </button>
        </div>

        <div className="field">
          <span className="field-label">支払い方法</span>
          <div className="chips">
            {data.methods.map((m) => (
              <button
                key={m.id}
                className={`chip ${m.id === methodId ? 'on' : ''}`}
                onClick={() => setMethodId(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
          {billing && method?.kind === 'credit' && (
            <p className="hint">
              {formatMD(billing.closingDate)} 締め → <strong>{formatMD(billing.paymentDate)} 引落</strong>
              {paymentMonth && '（Excelの支払月）'}
            </p>
          )}
        </div>

        {data.fixedCosts.length > 0 && (
          <label className="field">
            <span className="field-label">固定費の実額として記録</span>
            <select
              value={fixedCostId ?? ''}
              onChange={(e) => chooseFixed(e.target.value || undefined)}
            >
              <option value="">記録しない（普段の支出）</option>
              {data.fixedCosts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {openPlans.length > 0 && (
          <label className="field">
            <span className="field-label">予定の出費の支払いとして記録（確保したお金から払う）</span>
            <select value={plannedId ?? ''} onChange={(e) => choosePlanned(e.target.value || undefined)}>
              <option value="">記録しない（普段の支出）</option>
              {openPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{formatMD(p.date)}・{p.amount.toLocaleString('ja-JP')}円）
                </option>
              ))}
            </select>
          </label>
        )}

        {fixedCostId == null && (
          <div className="field">
            <span className="field-label">カテゴリ</span>
            <div className="chips">
              {categoryChoices.map((c) => (
                <button key={c} className={`chip ${c === category ? 'on' : ''}`} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="row2">
          <label className="field">
            <span className="field-label">利用日</span>
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
