/** 日付はすべてローカル日付の 'yyyy-MM-dd' 文字列で保持する */
export type YMD = string

export type PayType = 'monthly' | 'hourly'

export interface Member {
  id?: string
  name: string
  /** 給料日（1〜31、31 は月末扱い） */
  payday: number
  payType: PayType
  /** 月給の場合の手取り見込み額 */
  takeHome: number
  /** 以下は時給の場合の見込み計算用 */
  hourlyWage: number
  hoursPerDay: number
  daysPerMonth: number
  /** 税・社会保険などの控除率（%） */
  deductionRate: number
}

/** あるサイクルに実際に振り込まれた手取り額 */
export interface Income {
  id?: string
  memberId: string
  /** 対象サイクルの開始日 */
  cycleStart: YMD
  amount: number
}

export type MethodKind = 'credit' | 'debit' | 'qr' | 'cash'

export interface PaymentMethod {
  id?: string
  name: string
  kind: MethodKind
  /** 締め日（1〜31、31 は月末）。credit のみ使用 */
  closingDay: number
  /** 支払日（1〜31、31 は月末）。credit のみ使用 */
  paymentDay: number
  /** 締め月から何ヶ月後に引き落とされるか（翌月払い = 1） */
  monthOffset: number
  /** カード名義人。未設定なら共通 */
  ownerId?: string
  order: number
}

export interface FixedCost {
  id?: string
  name: string
  /** 見込み額。実額が入力されるまでこの金額で予算を確保する */
  amount: number
  /** 毎月の利用（計上）日 */
  day: number
  methodId: string
}

export interface Transaction {
  id?: string
  date: YMD
  amount: number
  category: string
  methodId: string
  memo: string
  /** 固定費の実額として入力された場合の紐付け */
  fixedCostId?: string
  /**
   * 引落月の指定（'yyyy-MM'）。締め日からの計算と実際の請求がずれる場合
   * （月末の公共料金が翌月請求に回る、返金の処理が遅れる等）に使う
   */
  paymentMonth?: string
  /** Excel 取り込み時の重複判定キー */
  importKey?: string
}

export interface Settings {
  id: 'main'
  /** 家計サイクルの開始日（通常は給料日） */
  cycleStartDay: number
  /** 先取り貯金額 */
  savings: number
  /** 口座残高（複数口座なら合計）。この日までの入出金が反映済みの額 */
  balance?: number
  balanceDate?: YMD
}

export const CATEGORIES = [
  '食費',
  '外食',
  '日用品',
  '交通',
  '娯楽',
  '衣服・美容',
  '医療',
  '交際',
  '子ども',
  'その他',
] as const

export const FIXED_CATEGORY = '固定費'

export const KIND_LABEL: Record<MethodKind, string> = {
  credit: 'クレジット',
  debit: 'デビット',
  qr: 'QR・電子マネー',
  cash: '現金',
}
