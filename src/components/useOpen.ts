import { useState } from 'react'

/** 閉じているカードの印を、この端末のブラウザに覚えておく（使えない環境では毎回開いた状態から） */
const KEY = 'moneyHomeCollapsed'

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // 保存できなくても、その場の開閉はできる
  }
}

/** 開いているか と 開閉の切り替え */
export function useOpen(id: string): [boolean, () => void] {
  const [closed, setClosed] = useState(() => read().includes(id))
  const toggle = () => {
    const next = !closed
    setClosed(next)
    const ids = new Set(read())
    if (next) ids.add(id)
    else ids.delete(id)
    write([...ids])
  }
  return [!closed, toggle]
}
