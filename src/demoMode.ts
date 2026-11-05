import { useSyncExternalStore } from 'react'

/**
 * デモ表示。実際のデータの代わりに、架空のサンプルデータを画面に出す（人に見せるとき用）。
 * 実データは読まず、書き込みも止めるので、画面に実際の金額・名前・メモは出ない。
 * 設定はこの端末のブラウザに覚える（使えない環境では、その場かぎり）。
 */
const KEY = 'moneyDemoMode'

const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let demo = read()
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const isDemo = () => demo

export function setDemo(on: boolean) {
  demo = on
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // 保存できなくても、その場の切り替えはできる
  }
  listeners.forEach((fn) => fn())
}

export const useDemo = () => useSyncExternalStore(subscribe, isDemo)

/** デモ表示中に入力しようとしたときの案内（連続して出さない） */
let lastNotice = 0
export function noticeDemo() {
  const now = Date.now()
  if (now - lastNotice < 1500 || typeof alert !== 'function') return
  lastNotice = now
  alert('デモ表示中は、入力内容を保存しません。\n（実際のデータは変更されません）')
}
