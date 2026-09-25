import { useSyncExternalStore } from 'react'

export type SyncState = 'unconfigured' | 'signedOut' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  email?: string | null
  /** 最後に送信が完了した時刻 */
  lastSync?: number
  /** まだ送信できていない変更の件数 */
  pending: number
  error?: string
}

let status: SyncStatus = { state: 'unconfigured', pending: 0 }
const listeners = new Set<() => void>()

export function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((fn) => fn())
}

export const getStatus = () => status

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const useSyncStatus = () => useSyncExternalStore(subscribe, getStatus)
