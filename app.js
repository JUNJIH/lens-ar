// ─────────────────────────────────────────────────────────
// LENS app.js（改良版）— canvasでパネルを"絵"として描いて板に貼る
// ─────────────────────────────────────────────────────────
// なぜ変えたか：
//   前の版は a-text で3D空間に文字を直接置いていたが、
//   標準フォントが日本語に対応しておらず文字が出なかった。
//   そこで、canvas（プログラムで絵を描ける画板）に日本語の
//   パネルを1枚描き、それを板テクスチャとして貼る方式にした。
//   canvasはブラウザ標準の日本語フォントを使えるので文字が出る。
// ─────────────────────────────────────────────────────────

const STORE = { name: "麺屋 こばやし" };

// 登録プロフィール（実アプリでは本人が設定する部分）
const PROFILES = [
  {
    key: "none",
    label: "レンズOFF",
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

// ── canvasにパネルを1枚描いて、その画像URL(dataURL)を返す ──
function drawPanel(p) {
  const W = 1024;
  const H = 640;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 背景（黒い角丸ボード）
  ctx.fillStyle = "#0d0f12";
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.fill();

  // 上部のアクセント帯（プロフィール色）
  ctx.fillStyle = p.accent;
  roundRect(ctx, 0, 0, W, 16, 8);
  ctx.fill();

  // 「レンズON」ラベル（none以外）
  let topY = 90;
  if (p.key !== "none") {
    ctx.fillStyle = p.accent;
    ctx.font = "bold 30px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("● レンズ ON", 60, topY);
    topY += 20;
  }

  // 見出し
  ctx.fillStyle = p.accent;
  ctx.font = "bold 56px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(p.headline, 60, topY + 60);

  // 区切り線
  ctx.strokeStyle = "#23262b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, topY + 100);
  ctx.lineTo(W - 60, topY + 100);
  ctx.stroke();

  // 各行
  ctx.fillStyle = "#f5f5f4";
  ctx.font = "44px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  p.lines.forEach((line, i) => {
    ctx.fillText(line, 60, topY + 180 + i * 80);
  });

  return canvas.toDataURL();
}

// 角丸四角のヘルパー（canvasには標準の角丸がないので自作）
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── マーカー上の板に、描いたパネル画像を貼る ──
function renderPanel() {
  const panel = document.getElementById("panel");
  const p = PROFILES.find((x) => x.key === current);
  const url = drawPanel(p);

  // 既存の板を消す
  while (panel.firstChild) panel.removeChild(panel.firstChild);

  // 板を作り、描いた画像をテクスチャとして貼る
  const board = document.createElement("a-plane");
  board.setAttribute("width", "2.2");
  board.setAttribute("height", "1.375"); // 1024:640 の比率に合わせる
  board.setAttribute("position", "0 0 0");
  board.setAttribute("material", `shader: flat; src: ${url}; transparent: true;`);
  panel.appendChild(board);
}

// ── プロフィール切り替えチップUI ──
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
      renderPanel(); // 切り替えたらパネルを描き直す
    };
    wrap.appendChild(b);
  });
}

// ── マーカー検出/ロストでガイド表示を出し分け ──
function wireMarkerEvents() {
  const marker = document.getElementById("marker");
  const hint = document.getElementById("hint");
  marker.addEventListener("markerFound", () => hint.classList.add("hidden"));
  marker.addEventListener("markerLost", () => hint.classList.remove("hidden"));
}

window.addEventListener("DOMContentLoaded", () => {
  buildChips();
  renderPanel();
  wireMarkerEvents();
});
