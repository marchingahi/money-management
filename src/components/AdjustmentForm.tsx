import { useState } from 'react'
import { todayYMD } from '../lib/dates'
import { expectedBalanceOn, type Ledger } from '../lib/ledger'
import type { Adjustment } from '../lib/types'
import { repo } from '../repo'
import { yen } from '../useData'

interface Props {
  ledger: Ledger
  /** 編集する調整、または新規作成時の初期値 */
  initial: Partial<Adjustment>
  onClose: () => void
}

type Mode = 'actual' | 'amount'

/** 全角のマイナス・カンマ・円記号を含む入力から、符号つきの整数を読む（読めなければ null） */
const parseSigned = (text: string): number | null => {
  const s = text.normalize('NFKC').replace(/[,¥円\s]/g, '').replace(/^[−ー]/, '-')
  return /^-?\d+$/.test(s) ? Number(s) : null
}

/**
 * 口座の残高の微調整。
 * 実際の残高に合わせる: 実際の残高を入れると、予想残高との差を調整として記録する。
 * 金額で調整する: 増やす・減らす金額を直接入れる。
 */
export function AdjustmentForm({ ledger, initial, onClose }: Props) {
  const { account } = ledger
  const editing = initial.id != null
  const [mode, setMode] = useState<Mode>(editing ? 'amount' : 'actual')
  const [date, setDate] = useState(initial.date ?? todayYMD())
  const [actual, setActual] = useState('')
  const [sign, setSign] = useState<1 | -1>((initial.amount ?? 0) < 0 ? -1 : 1)
  const [amount, setAmount] = useState(initial.amount ? String(Math.abs(initial.amount)) : '')
  const [memo, setMemo] = useState(initial.memo ?? '')

  // 残高を入力した日（当日を含む）以前の調整は、残高にすでに含まれているものとして反映されない
  const beforeBase = date <= ledger.base.date
  const expected = expectedBalanceOn(ledger, date)
  const actualValue = parseSigned(actual)
  const diff = mode === 'actual' && actualValue != null ? actualValue - expected : null
  const amountValue = Number(amount || 0) * sign
  const value = mode === 'actual' ? (diff ?? 0) : amountValue
  const canSave = !!date && value !== 0 && !(mode === 'actual' && beforeBase)

  const save = async () => {
    if (!canSave) return
    const a: Adjustment = { date, amount: value, accountId: account.id, memo: memo.trim() }
    if (editing) await repo.put('adjustments', { ...a, id: initial.id! })
    else await repo.add('adjustments', a)
    onClose()
  }

  const remove = async () => {
    if (!editing || !confirm('この調整を削除しますか？')) return
    await repo.remove('adjustments', initial.id!)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="残高の微調整">
        <div className="sheet-head">
          <h2>{editing ? '調整を編集' : `${account.name}の残高を微調整`}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        {!editing && (
          <div className="chips" role="tablist" aria-label="調整の方法">
            <button className={`chip ${mode === 'actual' ? 'on' : ''}`} onClick={() => setMode('actual')}>
              実際の残高に合わせる
            </button>
            <button className={`chip ${mode === 'amount' ? 'on' : ''}`} onClick={() => setMode('amount')}>
              金額で調整
            </button>
          </div>
        )}
        <p className="muted small">
          実際の残高とのずれを、残高だけに加える「調整」として記録します。収入・支出・予算には影響しません。ずれの原因が分かるときは、入出金を直すほうが正確です。
        </p>

        {mode === 'actual' ? (
          <>
            <label className="field">
              <span className="field-label">実際の残高（{account.name}）</span>
              <input
                inputMode="numeric"
                placeholder="例: 123456（マイナスは -1000）"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                autoFocus
              />
            </label>
            <dl className="breakdown">
              <div>
                <dt>
                  {date}の予想残高
                  <span className="muted small">この日の入出金を含みます。まだ入出金がない日の朝に合わせるときは、前日の日付にしてください</span>
                </dt>
                <dd>{yen(expected)}</dd>
              </div>
              {diff != null && (
                <div className="total">
                  <dt>調整する額（実際 − 予想）</dt>
                  <dd className={diff < 0 ? 'neg' : ''}>
                    {diff > 0 ? '+' : ''}
                    {yen(diff)}
                  </dd>
                </div>
              )}
            </dl>
            {actualValue != null && diff === 0 && <p className="hint">予想の残高と同じなので、調整は不要です。</p>}
          </>
        ) : (
          <>
            <div className="chips" role="tablist" aria-label="増やすか減らすか">
              <button className={`chip ${sign === 1 ? 'on' : ''}`} onClick={() => setSign(1)}>
                ＋ 残高を増やす
              </button>
              <button className={`chip ${sign === -1 ? 'on' : ''}`} onClick={() => setSign(-1)}>
                － 残高を減らす
              </button>
            </div>
            <label className="amount-field">
              <span>{sign === 1 ? '+¥' : '−¥'}</span>
              <input
                inputMode="numeric"
                placeholder="0"
                value={amount ? Number(amount).toLocaleString('ja-JP') : ''}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                autoFocus
              />
            </label>
          </>
        )}

        <div className="row2">
          <label className="field">
            <span className="field-label">調整する日</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">メモ</span>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: 手数料・端数（任意）" />
          </label>
        </div>
        {beforeBase && (
          <p className="cf-warn">
            この日付は、{account.name}の残高を入力した日（{ledger.base.date}）以前です。{mode === 'actual' ? '残高を入れ直すか、入力した日より後の日付にしてください。' : '残高に含まれている扱いで、残高には加えません。入力した日より後の日付にしてください。'}
          </p>
        )}

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
