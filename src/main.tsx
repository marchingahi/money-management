import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migrateLegacy } from './db'
import { loadSync } from './sync'

const root = createRoot(document.getElementById('root')!)

// 旧形式のデータを移行してから表示する（移行前の空データで同期が始まらないように）
migrateLegacy()
  .catch((e) => console.error('データの移行に失敗しました', e))
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    void loadSync()
  })
