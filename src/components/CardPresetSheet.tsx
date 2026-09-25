import { useState } from 'react'
import { CARD_PRESETS, describeSchedule, type CardPreset } from '../lib/cardPresets'
import { normalize } from '../lib/excelImport'
import type { MethodKind, PaymentMethod } from '../lib/types'
import { repo } from '../repo'

interface Props {
  nextOrder: number
  onClose: () => void
}

/** 支払い方法の追加: 主要カードは一覧から選ぶだけで締め日・支払日が入る */
export function CardPresetSheet({ nextOrder, onClose }: Props) {
  const [query, setQuery] = useState('')
  const q = normalize(query).toLowerCase()
  const presets = CARD_PRESETS.filter((p) => !q || normalize(p.name).toLowerCase().includes(q))

  const add = async (method: Omit<PaymentMethod, 'order'>) => {
    await repo.add('methods', { ...method, order: nextOrder })
    onClose()
  }

  const addPreset = (p: CardPreset) =>
    add({
      // 締め日の選択肢などの補足（かっこ内）は、カード名には入れない
      name: p.name.replace(/（.*?）|\s*(月末|15日)締め$/g, '').trim(),
      kind: 'credit',
      closingDay: p.closingDay,
      paymentDay: p.paymentDay,
      monthOffset: p.monthOffset,
    })

  const addOther = (name: string, kind: MethodKind) =>
    add({ name, kind, closingDay: 31, paymentDay: 27, monthOffset: 1 })

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="支払い方法を追加">
        <div className="sheet-head">
          <h2>支払い方法を追加</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <p className="muted small">
          主要カードは選ぶだけで締め日・支払日が入ります（2026年9月時点の各社公式ページの情報）。会員ごとに異なる場合もあるので、明細と違えば設定で直してください。
        </p>
        <input
          className="preset-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="カード名で絞り込み（例: 楽天）"
        />
        <ul className="list preset-list">
          {presets.map((p) => (
            <li key={p.name} className="clickable" onClick={() => addPreset(p)}>
              <span className="grow">
                <span>{p.name}</span>
                <span className="muted small">{describeSchedule(p)}</span>
                {p.note && <span className="muted small">※{p.note}</span>}
              </span>
              <a
                className="small"
                href={p.source}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                公式
              </a>
            </li>
          ))}
          {presets.length === 0 && <li className="muted small">一致するカードがありません</li>}
        </ul>
        <div className="btn-row">
          <button className="btn" onClick={() => addOther('新しいカード', 'credit')}>
            一覧にないカード（手動で設定）
          </button>
          <button className="btn" onClick={() => addOther('QR・電子マネー', 'qr')}>
            QR・電子マネー
          </button>
          <button className="btn" onClick={() => addOther('デビットカード', 'debit')}>
            デビットカード
          </button>
        </div>
      </div>
    </div>
  )
}
