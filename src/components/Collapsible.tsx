import type { ReactNode } from 'react'
import { useOpen } from './useOpen'

interface Props {
  /** 開閉の状態を覚えるための名前（カードごとに別の名前） */
  id: string
  title: string
  className?: string
  children: ReactNode
}

/** 見出しをタップして開閉できるカード。閉じても中の状態（選んだタブなど）は保たれる */
export function Collapsible({ id, title, className = 'card', children }: Props) {
  const [open, toggle] = useOpen(id)
  return (
    <section className={`${className} ${open ? '' : 'collapsed'}`}>
      <h2>
        <button type="button" className="collapse-head" aria-expanded={open} onClick={toggle}>
          <span>{title}</span>
          <span className="collapse-icon" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </button>
      </h2>
      <div hidden={!open}>{children}</div>
    </section>
  )
}
