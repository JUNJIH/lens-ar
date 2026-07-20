// ─────────────────────────────────────────────────────────
// /api/stores.js — 生活実験モード
// ─────────────────────────────────────────────────────────
// 【飲食店モードからの転換】
//   前：店の看板を認識 → 他人(店)が用意したメニューを出す
//   今：家の中の場所を認識 → 自分の情報を出す
//
// 構造はほぼ同じにしてある（placesは配列、順番がtargetIndex）。
// 各場所は「今すぐ見たい情報(items)」を持つ。
// 実験で場所が決まったら、name と items を実物に差し替える。
// ─────────────────────────────────────────────────────────

const PLACES = [
  {
    id: "fridge",
    name: "冷蔵庫まわり",
    // 期限が近い順・緊急のものを上に
    items: [
      { text: "牛乳 …あと2日", level: "warn" },
      { text: "卵 …あと5日", level: "info" },
      { text: "買い足し：醤油・米", level: "todo" },
    ],
  },
  {
    id: "desk",
    name: "机",
    items: [
      { text: "今日の最優先：LENS実験まとめ", level: "warn" },
      { text: "英語 30分", level: "todo" },
      { text: "夜：請求書の確認", level: "info" },
    ],
  },
  {
    id: "entrance",
    name: "玄関",
    items: [
      { text: "傘を持つ（午後から雨）", level: "warn" },
      { text: "鍵・財布・イヤホン", level: "info" },
      { text: "ゴミ出し：燃えるゴミ", level: "todo" },
    ],
  },
];

export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=10");
  res.status(200).json({
    updatedAt: new Date().toISOString(),
    places: PLACES,
  });
}
