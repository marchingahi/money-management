import { firebaseConfig } from './firebaseConfig'

/** Firebase は大きいので、同期が設定されているときだけ読み込む */
let engine: Promise<typeof import('./engine')> | null = null

export const syncConfigured = firebaseConfig != null

export function loadSync() {
  if (!firebaseConfig) return null
  engine ??= import('./engine').then((m) => {
    m.init(firebaseConfig!)
    return m
  })
  return engine
}
