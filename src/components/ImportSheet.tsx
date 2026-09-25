import { useMemo, useState, type ChangeEvent } from 'react'
import { repo } from '../repo'
import { formatMD } from '../lib/dates'
import { guessMethod, parseSheet, planImport, type ParseResult } from '../lib/excelImport'
import { yen, type AppData } from '../useData'

interface Props {
  data: AppData
  onClose: () => void
}

/** 先頭から順に、見出し行が見つかった最初のシートを読む */
async function readWorkbook(file: File): Promise<ParseResult> {
  // xlsx は大きいので取り込み時にだけ読み込む
  const X = await import('xlsx')
  const wb = X.read(await file.arrayBuffer())
  let lastError: unknown
  for (const name of wb.SheetNames) {
    const table = X.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null })
    try {
      return parseSheet(table)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError ?? new Error('シートがありません')
}

export function ImportSheet({ data, onClose }: Props) {
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setDone(null)
    setBusy(true)
    try {
      const result = await readWorkbook(file)
      const names = [...new Set(result.rows.map((r) => r.methodName))]
      setMapping(Object.fromEntries(names.map((n) => [n, guessMethod(n, data.methods)])))
      setParsed(result)
    } catch (err) {
      setParsed(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const plan = useMemo(() => {
    if (!parsed) return null
    const existing = new Set(data.transactions.flatMap((t) => (t.importKey ? [t.importKey] : [])))
    return planImport(parsed.rows, mapping, data.methods, existing)
  }, [parsed, mapping, data.methods, data.transactions])

  const methodCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of parsed?.rows ?? []) counts.set(r.methodName, (counts.get(r.methodName) ?? 0) + 1)
    return [...counts]
  }, [parsed])

  const unmappedRows = parsed?.rows.filter((r) => mapping[r.methodName] == null).length ?? 0
  const dates = parsed?.rows.map((r) => r.date).sort() ?? []

  const run = async () => {
    if (!plan?.transactions.length) return
    setBusy(true)
    try {
      await repo.bulkAdd('transactions', plan.transactions)
      setDone(plan.transactions.length)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Excelから取り込み">
        <div className="sheet-head">
          <h2>Excelから取り込み</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="muted small">
          「日付・支払月・支払方法・金額・固定・照合メモ」の列がある表を読み込みます。同じファイルを何度取り込んでも、取り込み済みの行は重複しません。
        </p>

        <label className="btn file-btn">
          {busy && !parsed ? '読み込み中…' : 'ファイルを選ぶ（.xlsx / .csv）'}
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
        </label>
        {error && <p className="error">{error}</p>}

        {parsed && plan && (
          <>
            <p className="import-summary">
              {parsed.rows.length}行（{formatMD(dates[0])}〜{formatMD(dates[dates.length - 1])}）を読み取りました
              {parsed.skipped.length > 0 && `。${parsed.skipped.length}行は読み取れませんでした`}
            </p>
            {parsed.skipped.length > 0 && (
              <ul className="muted small skipped">
                {parsed.skipped.slice(0, 5).map((s) => (
                  <li key={s.row}>
                    {s.row}行目: {s.reason}
                  </li>
                ))}
                {parsed.skipped.length > 5 && <li>ほか{parsed.skipped.length - 5}行</li>}
              </ul>
            )}

            <div className="field">
              <span className="field-label">支払方法の対応</span>
              <ul className="list">
                {methodCounts.map(([name, count]) => (
                  <li key={name}>
                    <span className="grow">
                      {name}
                      <span className="muted small">{count}件</span>
                    </span>
                    <select
                      className="map-select"
                      value={mapping[name] ?? ''}
                      onChange={(e) =>
                        setMapping({ ...mapping, [name]: e.target.value || undefined })
                      }
                    >
                      <option value="">取り込まない</option>
                      {data.methods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>

            <dl className="breakdown import-plan">
              <div>
                <dt>新しく取り込む</dt>
                <dd>{plan.transactions.length}件</dd>
              </div>
              <div className="sub">
                <dt>うち固定費</dt>
                <dd>{plan.transactions.filter((t) => t.category === '固定費').length}件</dd>
              </div>
              <div className="sub">
                <dt>合計金額</dt>
                <dd>{yen(plan.transactions.reduce((s, t) => s + t.amount, 0))}</dd>
              </div>
              {plan.duplicates > 0 && (
                <div>
                  <dt>取り込み済み（スキップ）</dt>
                  <dd>{plan.duplicates}件</dd>
                </div>
              )}
              {unmappedRows > 0 && (
                <div>
                  <dt>取り込まない</dt>
                  <dd>{unmappedRows}件</dd>
                </div>
              )}
            </dl>

            {done != null ? (
              <p className="hint">{done}件を取り込みました。履歴画面で確認できます。</p>
            ) : (
              <div className="sheet-actions">
                <button className="btn primary" disabled={busy || plan.transactions.length === 0} onClick={run}>
                  {plan.transactions.length}件を取り込む
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
