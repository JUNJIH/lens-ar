// ─────────────────────────────────────────────────────────
// life-app.js — 生活実験モードのロジック
// ─────────────────────────────────────────────────────────
// 飲食店版(mindar-app.js)から、余計なものを削ぎ落とした版。
//   ・プロフィール/興味マッチングは無し（自分専用なので不要）
//   ・場所ごとの情報を、緊急度(level)で色分けして出すだけ
//   ・タップは「次の場所プレビュー」等に使わず、まず見るだけに徹する
//     （頭部固定だと画面を触れないため）
// ─────────────────────────────────────────────────────────

let PLACES = [];
let lastSnapshot = "";
let netState = "起動中";

// 緊急度ごとの色
const LEVEL_COLOR = {
  warn: "#e8462d", // 赤：今すぐ気にすべき
  todo: "#e0a020", // 黄：やること
  info: "#7dd3fc", // 青：ただの情報
};

// ── 通信（ポーリング）──
async function fetchPlaces() {
  try {
    const res = await fetch("/api/stores");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const snapshot = JSON.stringify(data.places);
    if (snapshot === lastSnapshot) {
      netState = "更新なし";
      updateStatus();
      return;
    }
    lastSnapshot = snapshot;
    PLACES = data.places;
    netState = "更新あり";
    renderAllPanels();
    updateStatus();
  } catch (e) {
    console.error("取得失敗:", e);
    netState = "通信エラー";
    updateStatus();
  }
}

function startPolling() {
  fetchPlaces();
  setInterval(fetchPlaces, 30000);
}

function updateStatus() {
  const el = document.getElementById("status");
  if (el) el.textContent = netState;
}

// ── canvasユーティリティ ──
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── 場所パネルを描く ──
function drawPlace(place) {
  const W = 1024, H = 640;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = "#0d0f12";
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.fill();

  // 場所名
  ctx.fillStyle = "#f5f5f4";
  ctx.font = "bold 52px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(place.name, 56, 96);

  // 区切り線
  ctx.strokeStyle = "#3a3f47";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, 128);
  ctx.lineTo(W - 56, 128);
  ctx.stroke();

  // 情報リスト
  place.items.forEach((item, i) => {
    const y = 210 + i * 110;
    const color = LEVEL_COLOR[item.level] || "#9ca3af";

    // 左端の丸（緊急度の色）
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(78, y - 14, 14, 0, Math.PI * 2);
    ctx.fill();

    // テキスト
    ctx.fillStyle = "#f5f5f4";
    ctx.font = "44px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.fillText(item.text, 116, y);
  });

  return canvas;
}

// ── 板を用意して貼る ──
const boards = [];

function ensureBoard(targetIndex) {
  if (boards[targetIndex]) return boards[targetIndex];
  const targetEl = document.querySelector(
    `.lens-target[data-index="${targetIndex}"]`
  );
  if (!targetEl) return null;
  const panelEl = targetEl.querySelector(".lens-panel");
  const board = document.createElement("a-plane");
  board.setAttribute("width", "1");
  board.setAttribute("height", "0.625");
  board.setAttribute("position", "0 0 0");
  panelEl.appendChild(board);
  boards[targetIndex] = board;
  return board;
}

function renderPanel(targetIndex) {
  const place = PLACES[targetIndex];
  if (!place) return;
  const board = ensureBoard(targetIndex);
  if (!board) return;
  const canvas = drawPlace(place);

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

function renderAllPanels() {
  PLACES.forEach((_, i) => renderPanel(i));
}

function wireTargetEvents() {
  const hint = document.getElementById("hint");
  const found = new Set();
  document.querySelectorAll(".lens-target").forEach((el) => {
    const idx = el.dataset.index;
    el.addEventListener("targetFound", () => {
      found.add(idx);
      hint.classList.add("hidden");
    });
    el.addEventListener("targetLost", () => {
      found.delete(idx);
      if (found.size === 0) hint.classList.remove("hidden");
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  wireTargetEvents();
  startPolling();
});
