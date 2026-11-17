import { useMemo } from 'react'
import { formatMD } from '../lib/dates'
import { buildOutlook } from '../lib/outlook'
import { yen, type AppData } from '../useData'
import { Collapsible } from './Collapsible'

const md = (ymd: string) => formatMD(ymd).replace(/\(.\)$/, '')
const cls = (n: number) => (n < 0 ? 'neg' : '')
/** 表の中の金額は、スマホの幅に収まるよう「¥」を付けずに表示する（単位は表の上に書く） */
const num = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ja-JP')}`

/** 今後12回の給料の期間ごとの、収入・支出・差引・口座の合計残高の見通し */
export function OutlookCard({ data, today }: { data: AppData; today: string }) {
  const outlook = useMemo(() => buildOutlook(data, today), [data, today])
  const { rows, totals } = outlook
  const hasBalance = rows.some((r) => r.closing != null)

  return (
    <Collapsible id="outlook" title="今後12回の給料の見通し">
      <p className="muted small">
        給料の期間ごとに、確定している収入（給料・賞与・臨時収入）と支出（カードの引落・固定費・予定の出費・先取り貯金）を並べた見通しです。食費・日用品など、これから使う普段の支出は含みません。
      </p>
      <p className="outlook-total">
        12回の収入の合計 <strong>{yen(totals.income)}</strong>
        <span className="muted small">
          （給料 {yen(totals.salary)}
          {totals.extra > 0 && ` + 賞与・臨時収入 ${yen(totals.extra)}`}）
        </span>
      </p>
      <p className="muted small outlook-unit">単位: 円</p>
      <div className="outlook-scroll">
        <table className="outlook">
          <thead>
            <tr>
              <th>給料の期間</th>
              <th>収入</th>
              <th>支出</th>
              <th>差引</th>
              {hasBalance && <th>口座残高</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.cycle.start} className={i === 0 ? 'now' : ''}>
                <th scope="row">
                  {md(r.cycle.start)}〜{md(r.cycle.end)}
                  {i === 0 && <span className="badge ok">今</span>}
                </th>
                <td>
                  {num(r.income)}
                  {r.extra > 0 && <span className="outlook-sub">賞与等 {num(r.extra)}</span>}
                </td>
                <td>{num(r.spending)}</td>
                <td className={cls(r.net)}>{num(r.net)}</td>
                {hasBalance && (
                  <td className={cls(r.closing ?? 0)}>
                    {r.closing != null ? num(r.closing) : '—'}
                    {r.shortage === 'transfer' && <span className="badge est">要振替</span>}
                    {r.shortage === 'insufficient' && <span className="badge neg-badge">残高不足</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">12回の合計</th>
              <td>{num(totals.income)}</td>
              <td>{num(totals.spending)}</td>
              <td className={cls(totals.net)}>{num(totals.net)}</td>
              {hasBalance && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {hasBalance && (
        <p className="muted small">
          「口座残高」は、残高を入れた口座の、期間の終わりの合計です。残高を入れた日より前の入出金は、残高に含まれているものとして数えません。
        </p>
      )}
    </Collapsible>
  )
}
