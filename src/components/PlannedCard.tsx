import { useState } from 'react'
import { formatMD, todayYMD, type Cycle } from '../lib/dates'
import type { PlannedStatus } from '../lib/planned'
import type { PlannedExpense, Transaction } from '../lib/types'
import { yen, type AppData } from '../useData'
import { PlannedForm } from './PlannedForm'

interface Props {
  data: AppData
  cycle: Cycle
  statuses: PlannedStatus[]
  total: number
  onPay: (initial: Partial<Transaction>) => void
}

/** 支払い済みの予定の出費が、予算にどう効いているかの補足 */
function paidNote(s: PlannedStatus): string {
  // 確保していないもの（予定日が登録したサイクル中）は、支払った額がそのまま今サイクルの予算から出る
  if (s.reserveCycles === 0) return '（今サイクルの予算から）'
  if (s.dueCharge > 0) return `（予定より ${yen(s.dueCharge)} 多く、差額を今サイクルの予算から）`
  if (s.dueCharge < 0) return `（予定より ${yen(-s.dueCharge)} 少なく、差額は今サイクルの予算に戻る）`
  return '（確保したお金から）'
}

/** 予定の出費と、そのために今サイクルで確保するお金 */
export function PlannedCard({ data, cycle, statuses, total, onPay }: Props) {
  const [editing, setEditing] = useState<Partial<PlannedExpense> | null>(null)
  const today = todayYMD()
  // 支払い済みのものは、予定日のサイクルが終わるまで表示する
  const shown = statuses.filter((s) => s.paid == null || s.dueCycle.end >= cycle.start)
  const methodName = (id: string) => data.methods.find((m) => m.id === id)?.name ?? '（削除済み）'

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
          const reservedNow = s.reservedBefore + s.thisCycleReserve
          return (
            <li key={p.id}>
              <span className="date">{formatMD(p.date)}</span>
              <span className="grow clickable" onClick={() => setEditing(p)}>
                <span>
                  {p.name}
                  <span className="muted small"> {methodName(p.methodId)}</span>
                  {s.overdue && <span className="badge est">予定日を過ぎています</span>}
                </span>
                <span className="muted small">
                  {s.paid != null
                    ? `支払い済み ${yen(s.paid)}${paidNote(s)}`
                    : s.reserveCycles === 0
                      ? '今サイクルの予算から全額を確保'
                      : s.thisCycleReserve
                        ? `今サイクル ${yen(s.thisCycleReserve)} を確保（確保済み ${yen(reservedNow)} / ${yen(p.amount)}）`
                        : `確保済み ${yen(Math.min(reservedNow, p.amount))} / ${yen(p.amount)}`}
                </span>
              </span>
              <span className="planned-side">
                <span className="amount">{yen(p.amount)}</span>
                {s.paid == null && (p.date <= today || s.dueCycle.start === cycle.start) && (
                  <button
                    className="link-btn"
                    onClick={() =>
                      onPay({
                        plannedId: p.id,
                        amount: p.amount,
                        date: p.date <= today ? p.date : today,
                        methodId: p.methodId,
                        memo: p.name,
                        category: 'その他',
                      })
                    }
                  >
                    支払った
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
