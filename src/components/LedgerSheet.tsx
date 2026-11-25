import { formatMD, todayYMD } from '../lib/dates'
import type { Ledger } from '../lib/ledger'
import { expectedBalanceOn } from '../lib/ledger'
import { yen } from '../useData'

interface Props {
  ledger: Ledger
  onClose: () => void
  /** 微調整を始める（新規）、または編集する */
  onAdjust: (initial?: { id: string }) => void
  /** 残高を入れ直す */
  onEditBalance: () => void
}

/** 残高の推移を折れ線で表す（起点と、残高が動いた各時点） */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const span = max - min || 1
  const w = 300
  const h = 56
  const x = (i: number) => (i / (points.length - 1)) * w
  const y = (v: number) => h - 4 - ((v - min) / span) * (h - 8)
  return (
    <svg className="ledger-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="残高の推移">
      {min < 0 && <line x1="0" x2={w} y1={y(0)} y2={y(0)} className="spark-zero" />}
      <polyline fill="none" strokeWidth="2" className="spark-line" points={points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
    </svg>
  )
}

/** 口座の残高の推移。入出金を日付順に並べ、各時点の予想残高を出して、どこでずれたかを追えるようにする */
export function LedgerSheet({ ledger, onClose, onAdjust, onEditBalance }: Props) {
  const { account, base, entries } = ledger
  const today = todayYMD()
  const moving = entries.filter((e) => !e.settled)
  const points = [base.balance, ...moving.map((e) => e.balance)]
  const todayBalance = expectedBalanceOn(ledger, today)
  const last = entries.length ? entries[entries.length - 1].balance : base.balance
  const daysAgo = Math.max(0, Math.round((new Date(today).getTime() - new Date(base.date).getTime()) / 86400000))
  const cls = (n: number) => (n < 0 ? 'neg' : '')

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="口座の残高の推移">
        <div className="sheet-head">
          <h2>{account.name}の残高の推移</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        <dl className="breakdown">
          <div>
            <dt>
              最後に入力した残高（{formatMD(base.date)}）
              <span className="muted small">{daysAgo}日前</span>
            </dt>
            <dd>{yen(base.balance)}</dd>
          </div>
          <div>
            <dt>今日（{formatMD(today)}）の予想残高</dt>
            <dd className={cls(todayBalance)}>{yen(todayBalance)}</dd>
          </div>
          <div>
            <dt>これまでの予定の最後（{entries.length ? formatMD(entries[entries.length - 1].date) : formatMD(base.date)}）</dt>
            <dd className={cls(last)}>{yen(last)}</dd>
          </div>
        </dl>
        <Sparkline points={points} />
        <p className="muted small">
          実際の口座の残高と違うときは、下の「実際の残高に合わせる」で、差額を調整として記録できます。ずれが大きいときは、残高を入れ直してください。
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => onAdjust()}>
            実際の残高に合わせる・微調整
          </button>
          <button className="btn" onClick={onEditBalance}>
            残高を入れ直す
          </button>
        </div>

        <h3 className="ledger-head">入出金と残高</h3>
        <ul className="list ledger-list">
          <li className="ledger-base">
            <span className="date">{formatMD(base.date)}</span>
            <span className="grow">残高を入力</span>
            <span className="amount">{yen(base.balance)}</span>
          </li>
          {entries.length === 0 && <li className="muted small">このあとの入出金はまだありません</li>}
          {entries.map((e) => {
            const adjustable = e.adjustmentId != null
            const future = e.date > today
            return (
              <li
                key={e.key}
                className={`${e.settled ? 'done' : ''} ${adjustable ? 'clickable' : ''}`}
                onClick={adjustable ? () => onAdjust({ id: e.adjustmentId! }) : undefined}
              >
                <span className="date">{formatMD(e.date)}</span>
                <span className="grow">
                  <span>
                    {e.label}
                    {future && !e.settled && <span className="badge est">予定</span>}
                    {e.settled && <span className="badge">残高に反映済み</span>}
                  </span>
                  <span className={`muted small ${e.amount < 0 ? '' : 'pos'}`}>
                    {e.amount > 0 ? '+' : ''}
                    {yen(e.amount)}
                  </span>
                </span>
                <span className={`amount ${e.settled ? 'muted' : cls(e.balance)}`}>{yen(e.balance)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
