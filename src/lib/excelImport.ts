import { billingOf } from './billing'
import { FIXED_CATEGORY, type PaymentMethod, type Transaction, type YMD } from './types'

/**
 * 「日付 / 支払月 / 支払方法 / 金額 / 固定 / 店名 / 照合メモ」形式のクレジット利用表を取り込む。
 * xlsx の読み込み自体は画面側で行い、ここではシートを 2 次元配列として受け取る。
 */

export const UNCATEGORIZED = '未分類'

export interface ExcelRow {
  /** Excel 上の行番号（1 始まり） */
  row: number
  date: YMD
  /** Excel の支払月から推定した引落月 'yyyy-MM' */
  paymentMonth?: string
  methodName: string
  amount: number
  fixed: boolean
  memo: string
}

export interface ParseResult {
  rows: ExcelRow[]
  skipped: { row: number; reason: string }[]
}

const COLUMNS = {
  date: '日付',
  paymentMonth: '支払月',
  method: '支払方法',
  amount: '金額',
  fixed: '固定',
  store: '店名',
  memo: '照合メモ',
} as const
const REQUIRED = ['date', 'method', 'amount'] as const

export const normalize = (s: string) => s.normalize('NFKC').trim()

const pad = (n: number) => String(n).padStart(2, '0')

/** Excel のシリアル値・日付文字列・Date を 'yyyy-MM-dd' にする */
export function toDate(v: unknown): YMD | undefined {
  if (typeof v === 'number' && v > 0) {
    // Excel のシリアル値は 1899-12-30 起点（1900 年のうるう年バグ込み）
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  if (typeof v === 'string') {
    const m = normalize(v).match(/(\d{4})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/)
    if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
  }
  return undefined
}

function toAmount(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const s = normalize(v).replace(/[,¥円\s]/g, '').replace(/^▲|^△/, '-')
    if (/^-?\d+(\.\d+)?$/.test(s)) return Math.round(Number(s))
  }
  return undefined
}

/** 月だけの支払月を、利用日以降で最初に来るその月として 'yyyy-MM' にする */
export function toPaymentMonth(v: unknown, date: YMD): string | undefined {
  const month = typeof v === 'number' ? v : typeof v === 'string' ? Number(normalize(v).replace(/月$/, '')) : NaN
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined
  const y = Number(date.slice(0, 4))
  const usedMonth = Number(date.slice(5, 7))
  return `${month < usedMonth ? y + 1 : y}-${pad(month)}`
}

const cellText = (v: unknown) => (v == null ? '' : normalize(String(v)))

export function parseSheet(table: unknown[][]): ParseResult {
  const headerIndex = table.slice(0, 10).findIndex((r) => {
    const cells = r.map(cellText)
    return REQUIRED.every((k) => cells.includes(COLUMNS[k]))
  })
  if (headerIndex < 0) {
    throw new Error(`見出し行が見つかりません。「${REQUIRED.map((k) => COLUMNS[k]).join('」「')}」の列が必要です`)
  }
  const header = table[headerIndex].map(cellText)
  const col = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, name]) => [k, header.indexOf(name)]),
  ) as Record<keyof typeof COLUMNS, number>
  const get = (r: unknown[], k: keyof typeof COLUMNS) => (col[k] >= 0 ? r[col[k]] : undefined)

  const result: ParseResult = { rows: [], skipped: [] }
  table.slice(headerIndex + 1).forEach((r, i) => {
    const row = headerIndex + i + 2
    if (r.every((c) => cellText(c) === '')) return
    const date = toDate(get(r, 'date'))
    const methodName = cellText(get(r, 'method'))
    const amount = toAmount(get(r, 'amount'))
    if (!date) return result.skipped.push({ row, reason: '日付がありません' })
    if (!methodName) return result.skipped.push({ row, reason: '支払方法がありません' })
    if (amount == null) return result.skipped.push({ row, reason: '金額がありません' })
    result.rows.push({
      row,
      date,
      paymentMonth: toPaymentMonth(get(r, 'paymentMonth'), date),
      methodName,
      amount,
      fixed: cellText(get(r, 'fixed')) !== '',
      memo: cellText(get(r, 'store')) || cellText(get(r, 'memo')),
    })
  })
  return result
}

const ALIASES: [RegExp, string][] = [
  [/epos|エポス/i, 'エポス'],
  [/lumine|ルミネ/i, 'ルミネ'],
  [/saison|セゾン/i, 'セゾン'],
  [/aeon|イオン/i, 'イオン'],
  [/olive|オリーブ/i, 'olive'],
  [/paypay|ペイペイ/i, 'paypay'],
  [/jal/i, 'jal'],
  [/jcb/i, 'jcb'],
  [/現金|cash/i, '現金'],
]

const key = (s: string) =>
  normalize(s)
    .toLowerCase()
    .replace(/カード|card|\s/g, '')

/** Excel の支払方法名に対応するアプリの支払い方法を推測する */
export function guessMethod(excelName: string, methods: PaymentMethod[]): string | undefined {
  const k = key(excelName)
  const exact = methods.find((m) => key(m.name) === k)
  if (exact) return exact.id
  const partial = methods.find((m) => key(m.name) && (k.includes(key(m.name)) || key(m.name).includes(k)))
  if (partial) return partial.id
  for (const [re, alias] of ALIASES) {
    if (!re.test(excelName)) continue
    const hit = methods.find((m) => re.test(m.name) || key(m.name).includes(alias))
    if (hit) return hit.id
  }
  return undefined
}

export interface ImportPlan {
  /** 新しく登録する支出 */
  transactions: Transaction[]
  /** 取り込み済みのためスキップする件数 */
  duplicates: number
}

/**
 * 取り込む支出を組み立てる。同じ内容の行が複数ある場合も区別できるよう、
 * 出現順の番号を含めたキーで重複を判定する（照合メモは後から埋まるのでキーに含めない）。
 */
export function planImport(
  rows: ExcelRow[],
  mapping: Record<string, string | undefined>,
  methods: PaymentMethod[],
  existingKeys: Set<string>,
): ImportPlan {
  const seen = new Map<string, number>()
  const plan: ImportPlan = { transactions: [], duplicates: 0 }
  for (const r of rows) {
    const methodId = mapping[r.methodName]
    const method = methods.find((m) => m.id === methodId)
    if (!method) continue
    const base = `${r.date}|${r.methodName}|${r.amount}|${r.fixed ? 1 : 0}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const importKey = `${base}#${n}`
    if (existingKeys.has(importKey)) {
      plan.duplicates++
      continue
    }
    // 計算どおりの引落月なら保存しない（利用日やカードを後で変えたときに計算に戻るように）
    const computed = billingOf(r.date, method).paymentDate.slice(0, 7)
    const paymentMonth =
      method.kind === 'credit' && r.paymentMonth && r.paymentMonth !== computed ? r.paymentMonth : undefined
    plan.transactions.push({
      date: r.date,
      amount: r.amount,
      category: r.fixed ? FIXED_CATEGORY : UNCATEGORIZED,
      methodId: method.id!,
      memo: r.memo,
      ...(paymentMonth && { paymentMonth }),
      importKey,
    })
  }
  return plan
}
