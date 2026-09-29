import { normalize, toDate } from './excelImport'
import type { YMD } from './types'

export interface ReceiptOcrResult {
  amount?: number
  date?: YMD
  /** OCR の生テキスト（読み取り失敗時の手がかり用） */
  text: string
}

/** 金額が書かれていそうな行を優先する手がかり（見つかった中で最優先のものを採用） */
const AMOUNT_KEYWORDS = ['合計', 'ご利用金額', 'お会計', 'お買上']

function parseAmount(s: string): number | undefined {
  const n = Number(s.replace(/[,，]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/**
 * 行内の金額らしき数値（¥1,234 / 1,234円 など）をすべて拾う。
 * 通貨記号を必須にすることで、日付や電話番号などの数字を金額と誤認しないようにする。
 * OCR は「¥」を半角バックスラッシュとして誤認識することが多いため、それも許容する。
 */
function amountsInLine(line: string): number[] {
  const amounts: number[] = []
  for (const m of normalize(line).matchAll(/[¥￥\\]\s*(\d[\d,，]*)|(\d[\d,，]*)\s*円/g)) {
    const n = parseAmount(m[1] ?? m[2])
    if (n != null) amounts.push(n)
  }
  return amounts
}

export function extractAmount(text: string): number | undefined {
  const lines = text.split(/\r?\n/)
  for (const keyword of AMOUNT_KEYWORDS) {
    const line = lines.find((l) => l.includes(keyword) && !l.includes(`小${keyword}`))
    const amounts = line ? amountsInLine(line) : []
    if (amounts.length) return Math.max(...amounts)
  }
  // 手がかりの語が見つからなければ、全体で一番大きい金額らしき数値を合計とみなす
  const all = lines.flatMap(amountsInLine)
  return all.length ? Math.max(...all) : undefined
}

export function extractDate(text: string): YMD | undefined {
  for (const line of text.split(/\r?\n/)) {
    const d = toDate(line)
    if (d) return d
  }
  return undefined
}

/**
 * レシート画像から金額・日付を読み取る（ブラウザ内で完結、サーバー送信なし）。
 * 精度は完璧ではないため、呼び出し側で必ず人による確認・修正を挟むこと。
 */
export async function recognizeReceipt(image: Blob): Promise<ReceiptOcrResult> {
  // tesseract.js は大きいので使うときにだけ読み込む
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('jpn')
  try {
    const {
      data: { text },
    } = await worker.recognize(image)
    return { amount: extractAmount(text), date: extractDate(text), text }
  } finally {
    await worker.terminate()
  }
}
