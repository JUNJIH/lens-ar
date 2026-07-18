// ─────────────────────────────────────────────────────────
// LENS app.js（安定版）— canvasで描いた画像を板に確実に貼る
// ─────────────────────────────────────────────────────────
// 前の版は material に "shader: flat" を渡してエラーになった。
// この版では shader 指定をやめ、canvasで作った画像を
// THREE.js のテクスチャとして板に直接貼る、最も安定した方式にした。
// ─────────────────────────────────────────────────────────

const STORE = { name: "麺屋 こばやし" };

const PROFILES = [
  {
    key: "none",
    label: "レンズOFF",
    accent: "#9ca3af",
    headline: "麺屋 こばやし",
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
    {
    key: "d",
    label: "がっつり 25歳",
    accent: "#e0a02044",
    headline: "あなた向けの特盛",
    lines: ["マシマシラーメン ¥1000", "がっつり食べたい人向け"],
  },
];

let current = "none";

// ── canvasにパネルを1枚描いて、canvas要素そのものを返す ──
function drawPanelCanvas(p) {
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

  // 上部のアクセント帯
  ctx.fillStyle = p.accent;
  roundRect(ctx, 0, 0, W, 16, 8);
  ctx.fill();

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
  ctx.fillText(p.headline, 60, topY + 60);

  // 区切り線
  ctx.strokeStyle = "#3a3f47";
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

  return canvas;
}

// 角丸四角のヘルパー
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── 板を1枚だけ用意しておき、テクスチャだけ差し替える ──
let boardEl = null;

function ensureBoard() {
  if (boardEl) return boardEl;
  const panel = document.getElementById("panel");
  boardEl = document.createElement("a-plane");
  boardEl.setAttribute("width", "2.2");
  boardEl.setAttribute("height", "1.375"); // 1024:640 の比率
  boardEl.setAttribute("position", "0 0 0");
  panel.appendChild(boardEl);
  return boardEl;
}

// ── canvasの絵を、THREEのテクスチャとして板に貼る ──
function renderPanel() {
  const p = PROFILES.find((x) => x.key === current);
  const canvas = drawPanelCanvas(p);
  const board = ensureBoard();

  // A-Frameのmeshが用意できてから貼る
  const apply = () => {
    const mesh = board.getObject3D("mesh");
    if (!mesh) {
      // meshがまだなら少し待って再試行
      board.addEventListener("loaded", apply, { once: true });
      return;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    mesh.material.map = texture;
    mesh.material.transparent = true;
    mesh.material.needsUpdate = true;
  };
  apply();
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
      renderPanel();
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
