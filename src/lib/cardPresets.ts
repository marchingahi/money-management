/**
 * 主要カードの締め日・支払日（2026年9月時点で各社の公式ページで確認）。
 * 締め日・支払日の 31 は月末。monthOffset は締め月から何ヶ月後に払うか。
 * 同じカードで締め日を選べるものは、選択肢ごとに別の項目にしている。
 */
export interface CardPreset {
  name: string
  closingDay: number
  paymentDay: number
  monthOffset: number
  /** 選ぶときに知っておくべき注意 */
  note?: string
  /** 確認した公式ページ */
  source: string
}

export const CARD_PRESETS: CardPreset[] = [
  {
    name: '三井住友カード（Olive・NL など）月末締め',
    closingDay: 31,
    paymentDay: 26,
    monthOffset: 1,
    note: '支払日を26日にしている場合。10日払いにしている場合は「15日締め」を選んでください',
    source: 'https://faq-mem.smbc-card.com/--69969bb0db8389816f38658c',
  },
  {
    name: '三井住友カード（Olive・NL など）15日締め',
    closingDay: 15,
    paymentDay: 10,
    monthOffset: 1,
    note: '支払日を10日にしている場合',
    source: 'https://faq-mem.smbc-card.com/--69969bb0db8389816f38658c',
  },
  {
    name: '楽天カード',
    closingDay: 31,
    paymentDay: 27,
    monthOffset: 1,
    note: '楽天市場・楽天ペイ・楽天トラベルでの利用分だけは25日締め',
    source: 'https://www.rakuten-card.co.jp/minna-money/credit-card/select/article_2108_00001/',
  },
  {
    name: 'PayPayカード',
    closingDay: 31,
    paymentDay: 27,
    monthOffset: 1,
    source: 'https://www.paypay-card.co.jp/service/000173.html',
  },
  {
    name: 'JCBカード（JCB W・JCBカードS など）',
    closingDay: 15,
    paymentDay: 10,
    monthOffset: 1,
    source: 'https://j-faq.jcb.co.jp/faq/show/379?site_domain=default',
  },
  {
    name: 'dカード',
    closingDay: 15,
    paymentDay: 10,
    monthOffset: 1,
    source: 'https://fw.dcard.docomo.ne.jp/st/faq/detail/?faqId=451557',
  },
  {
    name: '三菱UFJカード',
    closingDay: 15,
    paymentDay: 10,
    monthOffset: 1,
    source: 'https://faq.cr.mufg.jp/mufgcard/detail?id=331',
  },
  {
    name: 'セブンカード・プラス',
    closingDay: 15,
    paymentDay: 10,
    monthOffset: 1,
    source: 'https://www.7card.co.jp/7card/service/payment/',
  },
  {
    name: 'au PAY カード（管理番号が9から始まる）',
    closingDay: 15,
    paymentDay: 10,
    monthOffset: 1,
    source: 'https://www.kddi-fs.com/support/payment/schedule/',
  },
  {
    name: 'au PAY カード（管理番号が5から始まる）',
    closingDay: 10,
    paymentDay: 4,
    monthOffset: 1,
    source: 'https://www.kddi-fs.com/support/payment/schedule/',
  },
  {
    name: 'セゾンカード',
    closingDay: 10,
    paymentDay: 4,
    monthOffset: 1,
    source: 'https://faq.saisoncard.co.jp/saison/detail?id=238',
  },
  {
    name: 'イオンカード',
    closingDay: 10,
    paymentDay: 2,
    monthOffset: 1,
    source: 'https://faq.aeon.co.jp/faq/show/431?site_domain=default',
  },
  {
    name: 'エポスカード（4日払い）',
    closingDay: 4,
    paymentDay: 4,
    monthOffset: 1,
    source: 'https://faq.eposcard.co.jp/faq/show/202?category_id=177&site_domain=default',
  },
  {
    name: 'エポスカード（27日払い）',
    closingDay: 27,
    paymentDay: 27,
    monthOffset: 1,
    source: 'https://faq.eposcard.co.jp/faq/show/202?category_id=177&site_domain=default',
  },
  {
    name: 'ビューカード・ルミネカード',
    closingDay: 5,
    paymentDay: 4,
    monthOffset: 1,
    source: 'https://faq.viewcard.co.jp/faq/show/118?site_domain=default',
  },
  {
    name: 'オリコカード',
    closingDay: 31,
    paymentDay: 27,
    monthOffset: 1,
    source: 'https://www.orico.co.jp/service/knowledge/withdrawal/',
  },
  {
    name: 'ライフカード（翌月3日払い）',
    closingDay: 5,
    paymentDay: 3,
    monthOffset: 1,
    note: '支払日は引落口座の金融機関で決まります。27日払いの口座なら「当月27日払い」を選んでください',
    source: 'https://www.lifecard.co.jp/howto/payment/account/',
  },
  {
    name: 'ライフカード（当月27日払い）',
    closingDay: 5,
    paymentDay: 27,
    monthOffset: 0,
    note: '支払日は引落口座の金融機関で決まります',
    source: 'https://www.lifecard.co.jp/howto/payment/account/',
  },
]

/** 表示用: 「15日締め → 翌月10日払い」 */
export function describeSchedule(p: Pick<CardPreset, 'closingDay' | 'paymentDay' | 'monthOffset'>): string {
  const day = (d: number) => (d >= 31 ? '月末' : `${d}日`)
  const month = ['当月', '翌月', '翌々月'][p.monthOffset] ?? `${p.monthOffset}ヶ月後の`
  return `${day(p.closingDay)}締め → ${month}${day(p.paymentDay)}払い`
}
