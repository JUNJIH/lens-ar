// ─────────────────────────────────────────────────────────
// LENS mindar-app.js — 複数ターゲット対応版
// ─────────────────────────────────────────────────────────
// 一番大きな変化：
//   前：パネル = f(見る人)
//   今：パネル = f(看板 × 見る人)
//
// 看板ごとに STORES を持ち、その中に見る人ごとの内容を持つ。
// 「どの看板か」と「誰として見るか」の掛け合わせで表示が決まる。
// ─────────────────────────────────────────────────────────

// ── 見る人（プロフィール）の定義 ──
const PROFILES = [
  { key: "none", label: "レンズOFF", accent: "#9ca3af" },
  { key: "a", label: "辛いの好き 24歳", accent: "#e8462d" },
  { key: "b", label: "ヘルシー・お酒 38歳", accent: "#37b58a" },
  { key: "c", label: "学生・安く 20歳", accent: "#e0a020" },
];

// ── 看板（ターゲット）の定義 ──
// 配列の順番 = .mind に登録した画像の順番 = targetIndex
const STORES = [
  {
    name: "麺屋 こばやし",
    views: {
      none: {
        headline: "麺屋 こばやし",
        lines: ["11:00 - 23:00 営業中", "ラーメン / 一品 / ドリンク"],
      },
      a: {
        headline: "あなた向けの一杯",
        lines: ["特製辛味噌ラーメン ¥980", "替え玉2回まで無料クーポン"],
      },
      b: {
        headline: "あなた向けの一皿",
        lines: ["鶏塩あっさり ¥900", "生ビール半額(20時以降)"],
      },
      c: {
        headline: "あなた向けのおトク",
        lines: ["醤油ラーメン並 ¥650", "学割:ライス大盛り無料"],
      },
    },
  },
  {
    name: "喫茶 ひだまり",
    views: {
      none: {
        headline: "喫茶 ひだまり",
        lines: ["8:00 - 19:00 営業中", "コーヒー / 軽食 / ケーキ"],
      },
      a: {
        headline: "あなた向けの一杯",
        lines: ["スパイスチャイ ¥580", "ジンジャー増量サービス"],
      },
      b: {
        headline: "あなた向けの一皿",
        lines: ["季節のフルーツプレート ¥880", "夜はワインも置いてます"],
      },
      c: {
        headline: "あなた向けのおトク",
        lines: ["モーニングセット ¥450", "学割:ドリンクおかわり無料"],
      },
    },
  },
];

let current = "none";

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

  // どの看板かを小さく表示（複数対応したので識別できると分かりやすい）
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

// ── 看板ごとに板を1枚ずつ用意しておく ──
// boards[targetIndex] = a-plane要素
const boards = [];

function ensureBoard(targetIndex) {
  if (boards[targetIndex]) return boards[targetIndex];

  const targetEl = document.querySelector(
    `.lens-target[data-index="${targetIndex}"]`
  );
  const panelEl = targetEl.querySelector(".lens-panel");

  const board = document.createElement("a-plane");
  board.setAttribute("width", "1");
  board.setAttribute("height", "0.625"); // 1024:640 の比率
  board.setAttribute("position", "0 0 0");
  panelEl.appendChild(board);

  boards[targetIndex] = board;
  return board;
}

// ── 1枚分のパネルを描いて貼る ──
function renderPanel(targetIndex) {
  const store = STORES[targetIndex];
  if (!store) return; // .mindに登録が無ければ何もしない

  const profile = PROFILES.find((x) => x.key === current);
  const canvas = drawPanelCanvas(store, profile);
  const board = ensureBoard(targetIndex);

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

// ── 全ての看板を描き直す（プロフィール切り替え時） ──
function renderAllPanels() {
  STORES.forEach((_, i) => renderPanel(i));
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
      renderAllPanels(); // 全看板を描き直す
    };
    wrap.appendChild(b);
  });
}

// ── 認識イベント（看板ごとに監視） ──
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
      // どの看板も見えなくなったときだけヒントを戻す
      if (found.size === 0) hint.classList.remove("hidden");
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  buildChips();
  renderAllPanels();
  wireTargetEvents();
});
