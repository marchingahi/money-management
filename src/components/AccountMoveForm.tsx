import { useState } from 'react'
import { accountMethodId } from '../lib/accountMethods'
import { todayYMD } from '../lib/dates'
import { CATEGORIES, FIXED_CATEGORY, type Account, type ExtraIncome, type FixedCost } from '../lib/types'
import { repo } from '../repo'

interface Props {
  accounts: (Account & { id: string })[]
  fixedCosts: (FixedCost & { id: string })[]
  /** 編集する臨時収入（入金）、または新規作成時の初期値 */
  initial: Partial<ExtraIncome>
  onClose: () => void
}

type Kind = 'out' | 'in'

/**
 * 口座の入出金の入力。
 * 出金: 口座から引き落とされた・振り込んだ支出。支出として記録し、口座の残高・給料ごとの残り・予算に反映する。
 * 入金: 給料以外で口座に直接入ったお金（臨時収入）。
 */
export function AccountMoveForm({ accounts, fixedCosts, initial, onClose }: Props) {
  const editing = initial.id != null
  // 賞与の実額の入力（見込み額から開く、または入力済みの実額の編集）。入金のみ
  const bonus = initial.bonusKey != null
  const [kind, setKind] = useState<Kind>('out')
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : '')
  const [date, setDate] = useState(initial.date ?? todayYMD())
  const [accountId, setAccountId] = useState(initial.accountId || accounts[0]?.id || '')
  const [memo, setMemo] = useState(initial.memo ?? '')
  const [category, setCategory] = useState<string>(FIXED_CATEGORY)
  const [fixedCostId, setFixedCostId] = useState('')
  const value = Number(amount || 0)
  const account = accounts.find((a) => a.id === accountId)
  // 残高を入力した日（当日を含む）までの入出金は、残高にすでに含まれているものとして口座残高には加えない
  const alreadyInBalance = !!(account?.balanceDate && date && date <= account.balanceDate)
  const canSave = value > 0 && accountId && date
  const isOut = !editing && !bonus && kind === 'out'

  // 固定費の実額として登録するとき、わかる項目を埋める（見込み額の代わりにこの金額で数える）
  const pickFixed = (id: string) => {
    setFixedCostId(id)
    const f = fixedCosts.find((x) => x.id === id)
    if (!f) return
    setCategory(FIXED_CATEGORY)
    if (!memo) setMemo(f.name)
    if (!amount) setAmount(String(f.amount))
    if (f.accountId && accounts.some((a) => a.id === f.accountId)) setAccountId(f.accountId)
  }

  const save = async () => {
    if (!canSave) return
    if (isOut) {
      const f = fixedCosts.find((x) => x.id === fixedCostId)
      await repo.add('transactions', {
        date,
        amount: value,
        category: f ? FIXED_CATEGORY : category,
        methodId: accountMethodId(accountId),
        memo: memo.trim() || f?.name || '',
        ...(f && { fixedCostId: f.id }),
      })
    } else {
      const x: ExtraIncome = { date, amount: value, accountId, memo: memo.trim(), ...(initial.bonusKey && { bonusKey: initial.bonusKey }) }
      if (editing) await repo.put('extraIncomes', { ...x, id: initial.id! })
      else await repo.add('extraIncomes', x)
    }
    onClose()
  }

  const remove = async () => {
    if (!editing || !confirm(bonus ? '入力した実額を削除して、見込み額に戻しますか？' : 'この入金を削除しますか？')) return
    await repo.remove('extraIncomes', initial.id!)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="口座の入出金">
        <div className="sheet-head">
          <h2>{bonus ? '賞与の実額' : editing ? '入金を編集' : '口座の入出金を記録'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        {!editing && !bonus && (
          <div className="chips" role="tablist" aria-label="入出金の種類">
            <button className={`chip ${kind === 'out' ? 'on' : ''}`} onClick={() => setKind('out')}>
              出金（引落・振込）
            </button>
            <button className={`chip ${kind === 'in' ? 'on' : ''}`} onClick={() => setKind('in')}>
              入金（臨時収入）
            </button>
          </div>
        )}
        <p className="muted small">
          {bonus
            ? '賞与の実際の手取り額と入金日を入力します。見込み額の代わりに、この金額で数えます。削除すると、見込み額に戻ります。'
            : isOut
            ? '口座から引き落とされた・振り込んだお金を、支出として記録します。口座の残高、その期間の「給料ごとの残り」、今サイクルの予算（あと使える額）から引かれます。'
            : 'ボーナス・還付金・臨時の振込など、給料以外で口座に直接入るお金を記録します。入金された口座の残高、その期間の「給料ごとの残り」、今サイクルの予算（あと使える額）に加わります。'}
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
            <span className="field-label">{isOut ? '出金される口座' : '入金される口座'}</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{isOut ? '出金日（予定日でも可）' : '入金日（予定日でも可）'}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {alreadyInBalance && (
          <p className="cf-warn">
            この日付は、{account?.name}の残高を入力した日（{account?.balanceDate}）以前です。{isOut ? '出金' : '入金'}済みで残高に含まれているものとして、口座の残高には加えません。残高に反映したいときは、日付を残高入力日より後にしてください。
          </p>
        )}

        {isOut && (
          <>
            {fixedCosts.length > 0 && (
              <label className="field">
                <span className="field-label">固定費の実額として登録（任意）</span>
                <select value={fixedCostId} onChange={(e) => pickFixed(e.target.value)}>
                  <option value="">登録しない（単発の出金）</option>
                  {fixedCosts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!fixedCostId && (
              <label className="field">
                <span className="field-label">種類</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {[FIXED_CATEGORY, ...CATEGORIES].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {fixedCostId && (
              <p className="muted small">登録済みの固定費の実額として数えます（見込み額の代わりに、この金額を使います）。</p>
            )}
          </>
        )}

        <label className="field">
          <span className="field-label">メモ</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={isOut ? '例: 家賃・税金（任意）' : '例: 還付金（任意）'}
          />
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
