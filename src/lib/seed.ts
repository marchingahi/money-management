import type { Member, PaymentMethod, Settings } from './types'

/*
 * 初期データ。ID を固定にしておくことで、別の端末で初期データが作られても
 * 同期時に同じレコードとして扱われ、カードや家族が重複しない。
 */

export const newMember = (name: string, payType: Member['payType'] = 'monthly'): Member => ({
  name,
  payday: 25,
  payType,
  takeHome: 0,
  hourlyWage: 0,
  hoursPerDay: 0,
  daysPerMonth: 0,
  deductionRate: 0,
})

const credit = (n: number, name: string, closingDay: number, paymentDay: number): PaymentMethod => ({
  id: `m-${n}`,
  name,
  kind: 'credit',
  closingDay,
  paymentDay,
  monthOffset: 1,
  order: n,
})

export const SEED_SETTINGS: Settings = { id: 'main', cycleStartDay: 25, savings: 0 }

export const SEED_MEMBERS: Member[] = [
  { id: 'p-1', ...newMember('自分') },
  { id: 'p-2', ...newMember('妻', 'hourly') },
]

/** 締め日・支払日の 31 は月末 */
export const SEED_METHODS: PaymentMethod[] = [
  credit(1, 'Olive', 31, 26),
  credit(2, 'PayPayカード', 31, 27),
  credit(3, 'セゾン', 10, 4),
  credit(4, 'JAL', 15, 10),
  credit(5, 'JCB W', 15, 10),
  credit(6, 'エポス', 4, 4),
  credit(7, 'ルミネ', 5, 4),
  credit(8, 'イオン', 10, 2),
  { id: 'm-9', name: '現金', kind: 'cash', closingDay: 31, paymentDay: 31, monthOffset: 0, order: 9 },
]
