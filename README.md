# 給料日サイクル家計簿

給料日（25日）から次の給料日までを1サイクルとして、「今月あといくら使えるか」とクレジットカードの引落予定を表示するPWA。

- データは端末のブラウザ内（IndexedDB）にのみ保存。移行は設定画面のバックアップ（JSON）で行う。
- `main` への push で GitHub Pages に自動デプロイ（`.github/workflows/deploy.yml`）。

```sh
npm install
npm run dev   # 開発サーバー
npm test      # 締め日・引落日の計算テスト
```
