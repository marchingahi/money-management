import { useMemo, useState } from 'react'
import { repo } from '../repo'
import { detectFixedCandidates } from '../lib/fixedDetect'
import { FIXED_CATEGORY } from '../lib/types'
import type { AppData } from '../useData'
import { FixedSuggest } from './FixedSuggest'

interface Props {
  data: AppData
  onClose: () => void
}

/** 登録済みの支出から、毎月同額の支払い（固定費の候補）を探して固定費にする */
export function FixedCheckSheet({ data, onClose }: Props) {
  const ignored = data.settings.fixedIgnored
  const candidates = useMemo(() => detectFixedCandidates(data.transactions, undefined, ignored), [data.transactions, ignored])
  const [selected, setSelected] = useState(() => new Set(candidates.map((c) => c.key)))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    try {
      const chosen = candidates.filter((c) => selected.has(c.key))
      for (const c of chosen) {
        for (const t of c.txs) if (t.id) await repo.update('transactions', t.id, { category: FIXED_CATEGORY })
      }
      // 外した候補は、次回から聞かない
      const skipped = candidates.filter((c) => !selected.has(c.key)).map((c) => c.key)
      if (skipped.length) {
        await repo.update('settings', 'main', { fixedIgnored: [...new Set([...(ignored ?? []), ...skipped])] })
      }
      setDone(`${chosen.reduce((s, c) => s + c.txs.length, 0)}件を固定費にしました`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="固定費の候補を確認">
        <div className="sheet-head">
          <h2>固定費の候補を確認</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        {done != null ? (
          <p className="hint">{done}</p>
        ) : candidates.length === 0 ? (
          <p className="muted small">3か月連続で同じ店・同じ金額の支払いは見つかりませんでした。</p>
        ) : (
          <>
            <FixedSuggest candidates={candidates} selected={selected} onChange={setSelected} />
            <div className="sheet-actions">
              <button className="btn primary" disabled={busy} onClick={run}>
                決定する
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
