import { cardTimings } from '../lib/cardTiming'
import { Collapsible } from './Collapsible'
import { cycleRule, formatMD, type Cycle } from '../lib/dates'
import type { AppData } from '../useData'

interface Props {
  data: AppData
  today: string
  /** 今のサイクル。引落がここに収まるカードを見分ける */
  cycle: Cycle
}

const paydayLabel = (c: Cycle) => `${formatMD(c.start).replace(/\(.\)$/, '')}の給料`

/** 今日どのカードで使うと、いつ締められ、どの給料から払うことになるか */
export function CardTimingCard({ data, today, cycle }: Props) {
  const timings = cardTimings(today, data.methods, cycleRule(data.settings))
  if (timings.length === 0) return null
  return (
    <Collapsible id="card-timing" title="どのカードで使うと、いつ払う？">
      <p className="muted small">
        今日（{formatMD(today)}）に使った場合の、各カードの締め日・引落日と、払う給料です。
      </p>
      <ul className="list">
        {timings.map((t) => {
          const inThisCycle = t.paymentDate >= cycle.start && t.paymentDate <= cycle.end
          return (
            <li key={t.method.id}>
              <span className="grow">
                <span>{t.method.name}</span>
                <span className="muted small">
                  締め {formatMD(t.closingDate)}
                  {t.daysToClosing === 0 ? '（今日）' : `（あと${t.daysToClosing}日）`}
                </span>
              </span>
              <span className="grow" style={{ alignItems: 'flex-end', flex: 'none' }}>
                <span>{formatMD(t.paymentDate)}引落</span>
                <span className={`badge ${inThisCycle ? 'ok' : 'est'}`}>
                  {paydayLabel(t.payCycle)}から{inThisCycle ? '（今サイクル内）' : ''}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </Collapsible>
  )
}
