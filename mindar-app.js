// ─────────────────────────────────────────────────────────
// LENS mindar-app.js — サーバーからデータを取得する版
// ─────────────────────────────────────────────────────────
// 変更点：STORES をコードに直書きするのをやめ、
//         /api/stores から取ってくるようにした。
//
//   起動時    → 1回取得して表示
//   30秒ごと  → 取り直して、変わっていれば描き直す（ポーリング）
//
// Day2で検討した通り、WebSocketではなくポーリングを選択。
// 看板にかざした瞬間だけ情報が要るので、常時接続は過剰。
// ─────────────────────────────────────────────────────────

const PROFILES = [
  { key: "none", label: "レンズOFF", accent: "#9ca3af" },
  { key: "a", label: "辛いの好き 24歳", accent: "#e8462d" },
  { key: "b", label: "ヘルシー・お酒 38歳", accent: "#37b58a" },
  { key: "c", label: "学生・安く 20歳", accent: "#e0a020" },
];

let current = "none";

// サーバーから取ってきた看板データを入れる箱。最初は空。
let STORES = [];

// 前回取得したデータの中身（変化があったかの比較用）
let lastSnapshot = "";

// 通信状態（画面に出すため）
let netState = "起動中";

// ── サーバーから看板データを取得する ──
async function fetchStores() {
  try {
    const res = await fetch("/api/stores");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    // 中身が前回と同じなら、描き直さない（無駄な処理を省く）
    const snapshot = JSON.stringify(data.stores);
    if (snapshot === lastSnapshot) {
      netState = "更新なし";
      updateStatus();
      return;
    }

    lastSnapshot = snapshot;
    STORES = data.stores;
    netState = "更新あり";
    renderAllPanels();
    updateStatus();
  } catch (e) {
    // 通信に失敗しても、前回のデータで表示は続ける（壊れない）
    console.error("取得失敗:", e);
    netState = "通信エラー";
    updateStatus();
  }
}

// ── ポーリング開始（30秒ごとに取り直す） ──
function startPolling() {
  fetchStores(); // まず1回
  setInterval(fetchStores, 30000); // 以後30秒ごと
}

function updateStatus() {
  const el = document.getElementById("status");
  if (el) el.textContent = netState;
}

// ── canvasにパネルを描く ──
function drawPanelCanvas(store, profile) {
  const view = store.views[profile.key];
  const W = 1024;
  const H = 640;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d0f12";
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.fill();

  ctx.fillStyle = profile.accent;
  roundRect(ctx, 0, 0, W, 16, 8);
  ctx.fill();

  let topY = 90;

  ctx.fillStyle = "#6b7280";
  ctx.font = "28px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(store.name, 60, topY);

  if (profile.key !== "none") {
    ctx.fillStyle = profile.accent;
    ctx.font = "bold 28px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("● レンズ ON", W - 60, topY);
    ctx.textAlign = "left";
  }
  topY += 20;

  ctx.fillStyle = profile.accent;
  ctx.font = "bold 56px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.fillText(view.headline, 60, topY + 60);

  ctx.strokeStyle = "#3a3f47";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, topY + 100);
  ctx.lineTo(W - 60, topY + 100);
  ctx.stroke();

  ctx.fillStyle = "#f5f5f4";
  ctx.font = "44px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  view.lines.forEach((line, i) => {
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

const boards = [];

function ensureBoard(targetIndex) {
  if (boards[targetIndex]) return boards[targetIndex];

  const targetEl = document.querySelector(
    `.lens-target[data-index="${targetIndex}"]`
  );
  if (!targetEl) return null; // HTMLに枠が無ければ何もしない

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
  const store = STORES[targetIndex];
  if (!store) return;

  const profile = PROFILES.find((x) => x.key === current);
  const canvas = drawPanelCanvas(store, profile);
  const board = ensureBoard(targetIndex);
  if (!board) return;

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
  STORES.forEach((_, i) => renderPanel(i));
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
      renderAllPanels();
    };
    wrap.appendChild(b);
  });
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
  buildChips();
  wireTargetEvents();
  startPolling(); // データを取ってきてから描画される
});
