import { useState } from 'react'
import { formatMD, todayYMD, type Cycle } from '../lib/dates'
import type { PlannedStatus } from '../lib/planned'
import type { PlannedExpense, Transaction } from '../lib/types'
import { repo } from '../repo'
import { yen, type AppData } from '../useData'
import { PlannedForm } from './PlannedForm'

interface Props {
  data: AppData
  cycle: Cycle
  statuses: PlannedStatus[]
  total: number
  onPay: (initial: Partial<Transaction>) => void
}

/** 払い終えた予定の出費が、予算にどう効いたかの補足 */
function closedNote(s: PlannedStatus): string {
  // 確保していなかった・予定日より前に払い終えたものは、払ったサイクルの予算で精算する
  if (s.reserveCycles === 0 || s.settleCycle.start !== s.dueCycle.start) return '（払ったサイクルの予算で精算）'
  if (s.dueCharge > 0) return `（予定より ${yen(s.dueCharge)} 多く、差額を予算から）`
  if (s.dueCharge < 0) return `（予定より ${yen(-s.dueCharge)} 少なく、差額は予算に戻る）`
  return '（確保したお金から）'
}

function describe(s: PlannedStatus): string {
  const p = s.plan
  if (s.closed) return `支払い完了 ${yen(s.paid ?? 0)}${closedNote(s)}`
  if (s.paid != null) return `一部支払い済み ${yen(s.paid)} / ${yen(p.amount)}（残り ${yen(s.remaining)}）`
  if (s.reserveCycles === 0) return '今サイクルの予算から全額を確保'
  const reservedNow = Math.min(s.reservedBefore + s.thisCycleReserve, p.amount)
  return s.thisCycleReserve
    ? `今サイクル ${yen(s.thisCycleReserve)} を確保（確保済み ${yen(reservedNow)} / ${yen(p.amount)}）`
    : `確保済み ${yen(reservedNow)} / ${yen(p.amount)}`
}

/** 予定の出費と、そのために今サイクルで確保するお金 */
export function PlannedCard({ data, cycle, statuses, total, onPay }: Props) {
  const [editing, setEditing] = useState<Partial<PlannedExpense> | null>(null)
  const today = todayYMD()
  // 払い終えたものは、精算したサイクルが終わるまで表示する
  const shown = statuses.filter((s) => !s.closed || s.settleCycle.end >= cycle.start)
  const methodName = (id: string) => data.methods.find((m) => m.id === id)?.name ?? '（削除済み）'

  const pay = (p: PlannedExpense & { id: string }, amount: number) =>
    onPay({
      plannedId: p.id,
      amount,
      date: p.date <= today ? p.date : today,
      methodId: p.methodId,
      memo: p.name,
      category: 'その他',
    })

  return (
    <section className="card planned">
      <h2>予定の出費</h2>
      {shown.length > 0 ? (
        <p className="planned-lead">
          今サイクルで確保するお金 <strong>{yen(total)}</strong>
        </p>
      ) : (
        <p className="muted small">
          旅行・車検・年払いの保険など、先に分かっている出費を登録すると、予定日までに毎サイクル少しずつ確保します。
        </p>
      )}
      <ul className="list">
        {shown.map((s) => {
          const p = s.plan
          return (
            <li key={p.id}>
              <span className="date">{formatMD(p.date)}</span>
              <span className="grow clickable" onClick={() => setEditing(p)}>
                <span>
                  {p.name}
                  <span className="muted small"> {methodName(p.methodId)}</span>
                  {s.overdue && <span className="badge est">予定日を過ぎています</span>}
                </span>
                <span className="muted small">{describe(s)}</span>
              </span>
              <span className="planned-side">
                <span className="amount">{yen(p.amount)}</span>
                {!s.closed && (
                  <button className="link-btn" onClick={() => pay(p, s.remaining || p.amount)}>
                    {s.paid == null ? '支払った' : '残りを支払った'}
                  </button>
                )}
                {!s.closed && s.paid != null && (
                  <button
                    className="link-btn"
                    onClick={() =>
                      confirm(`残り ${yen(s.remaining)} は払わずに完了にしますか？（確保していた分は予算に戻ります）`) &&
                      repo.update('planned', p.id, { closedOn: today })
                    }
                  >
                    これで完了
                  </button>
                )}
                {s.closed && p.closedOn && (
                  <button className="link-btn" onClick={() => repo.update('planned', p.id, { closedOn: undefined })}>
                    完了を取り消す
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <button className="btn" onClick={() => setEditing({})}>
        ＋ 予定の出費を追加
      </button>

      {editing && (
        <PlannedForm
          methods={data.methods}
          startDay={data.settings.cycleStartDay}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}
