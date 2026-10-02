import { yen } from '../useData'
import type { FixedCandidate } from '../lib/fixedDetect'

interface Props {
  candidates: FixedCandidate[]
  /** 固定費にする候補のキー */
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

/** 前月・前々月と同額の支払いを、固定費にするか選ぶ一覧 */
export function FixedSuggest({ candidates, selected, onChange }: Props) {
  if (candidates.length === 0) return null
  const toggle = (key: string) => {
    const next = new Set(selected)
    if (!next.delete(key)) next.add(key)
    onChange(next)
  }
  return (
    <div className="field">
      <span className="field-label">固定費にしますか？</span>
      <p className="muted small">前月・前々月にも同じ店・同じ金額の支払いがあります。チェックを外すと固定費にしません。</p>
      <ul className="list">
        {candidates.map((c) => (
          <li key={c.key}>
            <label className="grow">
              <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} /> {c.memo}
              <span className="muted small">
                {yen(c.amount)}・{c.months.length}か月連続・{c.txs.length}件
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
