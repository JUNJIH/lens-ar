// ─────────────────────────────────────────────────────────
// LENS mindar-app.js — 画像認識版のロジック
// ─────────────────────────────────────────────────────────
// 昨日書いた app.js とほぼ同じ。違うのは2点だけ：
//   1. 板のサイズ（MindARは認識画像の幅を 1 として扱う）
//   2. 認識イベント名（markerFound → targetFound）
// パネルを描く部分は完全に使い回せている＝設計が良かった証拠。
// ─────────────────────────────────────────────────────────

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
];

let current = "none";

// ── canvasにパネルを描く（昨日とまったく同じ） ──
function drawPanelCanvas(p) {
  const W = 1024;
  const H = 640;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d0f12";
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.fill();

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

  ctx.fillStyle = p.accent;
  ctx.font = "bold 56px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(p.headline, 60, topY + 60);

  ctx.strokeStyle = "#3a3f47";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, topY + 100);
  ctx.lineTo(W - 60, topY + 100);
  ctx.stroke();

  ctx.fillStyle = "#f5f5f4";
  ctx.font = "44px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  p.lines.forEach((line, i) => {
    ctx.fillText(line, 60, topY + 180 + i * 80);
  });

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── 板を1枚用意（MindARは認識画像の幅を 1 として扱う） ──
let boardEl = null;

function ensureBoard() {
  if (boardEl) return boardEl;
  const panel = document.getElementById("panel");
  boardEl = document.createElement("a-plane");
  boardEl.setAttribute("width", "1");
  boardEl.setAttribute("height", "0.625"); // 1024:640 の比率
  boardEl.setAttribute("position", "0 0 0");
  panel.appendChild(boardEl);
  return boardEl;
}

function renderPanel() {
  const p = PROFILES.find((x) => x.key === current);
  const canvas = drawPanelCanvas(p);
  const board = ensureBoard();

  const apply = () => {
    const mesh = board.getObject3D("mesh");
    if (!mesh) {
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

// ── 認識イベント（ここがAR.jsとの違い） ──
// AR.js : markerFound / markerLost
// MindAR: targetFound / targetLost
function wireTargetEvents() {
  const target = document.getElementById("target");
  const hint = document.getElementById("hint");
  target.addEventListener("targetFound", () => hint.classList.add("hidden"));
  target.addEventListener("targetLost", () => hint.classList.remove("hidden"));
}

window.addEventListener("DOMContentLoaded", () => {
  buildChips();
  renderPanel();
  wireTargetEvents();
});
