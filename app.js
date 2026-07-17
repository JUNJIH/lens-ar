// ─────────────────────────────────────────────────────────
// LENS app.js — 「同じマーカーが、見る人によって変わる」中身
// ─────────────────────────────────────────────────────────
// ここが心臓部。マーカーの上に浮かべる情報を、選んだプロフィールに
// 応じて組み立てて差し替える。看板そのもの（マーカー）は1つのまま。
// ─────────────────────────────────────────────────────────

// 店が掲げる固定情報（レンズを通さない世界の看板）
const STORE = { name: "麺屋 こばやし" };

// 登録プロフィール。実アプリでは本人が設定する部分。
const PROFILES = [
  {
    key: "none",
    label: "レンズなし",
    accent: "#9ca3af",
    headline: STORE.name,
    lines: ["11:00 - 23:00 営業中", "ラーメン / 一品 / ドリンク"],
  },
  {
    key: "a",
    label: "辛いの好き 24歳",
    accent: "#e8462d",
    headline: "あなた向けの一杯",
    lines: ["特製辛味噌ラーメン ¥980", "替え玉2回まで無料クーポン"],
  },
  {
    key: "b",
    label: "ヘルシー・お酒 38歳",
    accent: "#37b58a",
    headline: "あなた向けの一皿",
    lines: ["鶏塩あっさり ¥900", "生ビール半額(20時以降)"],
  },
  {
    key: "c",
    label: "学生・安く 20歳",
    accent: "#e0a020",
    headline: "あなた向けのおトク",
    lines: ["醤油ラーメン並 ¥650", "学割:ライス大盛り無料"],
  },
];

let current = "none";

// ── マーカー上のパネルを、選択プロフィールに応じて組み立てる ──
function renderPanel() {
  const panel = document.getElementById("panel");
  const p = PROFILES.find((x) => x.key === current);

  // 一旦中身をクリア
  while (panel.firstChild) panel.removeChild(panel.firstChild);

  // 背景ボード（黒い板）
  const board = document.createElement("a-plane");
  board.setAttribute("width", "2.2");
  board.setAttribute("height", "1.4");
  board.setAttribute("color", "#0d0f12");
  board.setAttribute("opacity", "0.92");
  board.setAttribute("position", "0 0 0");
  panel.appendChild(board);

  // アクセントの帯（プロフィールごとの色）
  const bar = document.createElement("a-plane");
  bar.setAttribute("width", "2.2");
  bar.setAttribute("height", "0.08");
  bar.setAttribute("color", p.accent);
  bar.setAttribute("position", "0 0.62 0.01");
  panel.appendChild(bar);

  // 見出しテキスト
  const head = document.createElement("a-text");
  head.setAttribute("value", p.headline);
  head.setAttribute("color", p.accent);
  head.setAttribute("align", "center");
  head.setAttribute("width", "3");
  head.setAttribute("position", "0 0.42 0.02");
  panel.appendChild(head);

  // 各行の情報
  p.lines.forEach((line, i) => {
    const t = document.createElement("a-text");
    t.setAttribute("value", line);
    t.setAttribute("color", "#f5f5f4");
    t.setAttribute("align", "center");
    t.setAttribute("width", "2.6");
    t.setAttribute("position", `0 ${0.12 - i * 0.32} 0.02`);
    panel.appendChild(t);
  });
}

// ── プロフィール切り替えチップUIを作る ──
function buildChips() {
  const wrap = document.getElementById("chips");
  PROFILES.forEach((p) => {
    const b = document.createElement("button");
    b.className = "chip" + (p.key === current ? " active" : "");
    b.textContent = p.label;
    b.onclick = () => {
      current = p.key;
      document
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.remove("active"));
      b.classList.add("active");
      renderPanel(); // ← 切り替えたら看板の中身を作り直す
    };
    wrap.appendChild(b);
  });
}

// ── マーカーの検出/ロストでガイド表示を出し分ける ──
function wireMarkerEvents() {
  const marker = document.getElementById("marker");
  const hint = document.getElementById("hint");
  marker.addEventListener("markerFound", () => hint.classList.add("hidden"));
  marker.addEventListener("markerLost", () => hint.classList.remove("hidden"));
}

// 初期化
window.addEventListener("DOMContentLoaded", () => {
  buildChips();
  renderPanel();
  wireMarkerEvents();
});
