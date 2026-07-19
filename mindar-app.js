// ─────────────────────────────────────────────────────────
// LENS mindar-app.js — 触れるパネル / 興味マッチング版
// ─────────────────────────────────────────────────────────
// 大きな変化は2つ。
//
// 【1】パーソナライズが本物になった
//   前：店がプロフィールごとの文章を用意 → 組合せ爆発で破綻する
//   今：店は全メニュー（タグ付き）を出すだけ。
//       アプリがユーザーの興味タグと突き合わせて点数をつけ、並べ替える。
//       → プロフィールが何万通りでも、店は何も書き足さなくていい。
//
// 【2】パネルが触れるようになった
//   板を「本体」と「ボタン」に分け、自前のレイキャストで当たり判定する。
//   画面遷移：ホーム →「お店のおすすめ」/「あなたの興味」→ 戻る
// ─────────────────────────────────────────────────────────

// ── 見る人（プロフィール）──
// 実アプリでは本人が設定する。今は検証用の決め打ち。
const PROFILES = [
  {
    key: "none", label: "レンズOFF", accent: "#9ca3af",
    interests: [], budget: null,
  },
  {
    key: "a", label: "辛いの好き 24歳", accent: "#e8462d",
    interests: ["辛い", "こってり", "スパイス"], budget: 1200,
  },
  {
    key: "b", label: "ヘルシー・お酒 38歳", accent: "#37b58a",
    interests: ["ヘルシー", "あっさり", "酒", "酒に合う"], budget: 2000,
  },
  {
    key: "c", label: "学生・安く 20歳", accent: "#e0a020",
    interests: ["安い", "学割", "定番"], budget: 800,
  },
];

let current = "none";
let STORES = [];
let lastSnapshot = "";
let netState = "起動中";

// 看板ごとの画面状態： "home" | "store" | "you"
const screens = {};

// ─────────────────────────────────────────────
// 興味マッチング：ここがパーソナライズの心臓部
// ─────────────────────────────────────────────
// メニュー1品ごとに点数をつける。
//   ・興味タグと一致するタグ1つにつき +10点
//   ・予算内なら +3点、予算を大きく超えるなら減点
// 点数順に並べて上位を返す。
function scoreItem(item, profile) {
  let score = 0;

  item.tags.forEach((tag) => {
    if (profile.interests.includes(tag)) score += 10;
  });

  if (profile.budget != null) {
    if (item.price <= profile.budget) score += 3;
    else if (item.price > profile.budget * 1.5) score -= 5;
  }

  return score;
}

function pickForYou(store, profile, n = 3) {
  return store.menu
    .map((item) => ({ item, score: scoreItem(item, profile) }))
    .filter((x) => x.score > 0)          // 点数がつかないものは出さない
    .sort((a, b) => b.score - a.score)   // 高い順
    .slice(0, n);
}

function pickRecommends(store, n = 3) {
  return store.recommends
    .map((id) => store.menu.find((m) => m.id === id))
    .filter(Boolean)
    .slice(0, n);
}

// ─────────────────────────────────────────────
// 通信（ポーリング）
// ─────────────────────────────────────────────
async function fetchStores() {
  try {
    const res = await fetch("/api/stores");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

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
    console.error("取得失敗:", e);
    netState = "通信エラー";
    updateStatus();
  }
}

function startPolling() {
  fetchStores();
  setInterval(fetchStores, 30000);
}

function updateStatus() {
  const el = document.getElementById("status");
  if (el) el.textContent = netState;
}

// ─────────────────────────────────────────────
// 描画：canvasユーティリティ
// ─────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// ── 本体パネルを描く ──
function drawBoard(store, profile, screen) {
  const W = 1024, H = 560;
  const canvas = newCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d0f12";
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.fill();

  ctx.fillStyle = profile.accent;
  roundRect(ctx, 0, 0, W, 14, 7);
  ctx.fill();

  // ヘッダー
  ctx.fillStyle = "#6b7280";
  ctx.font = "28px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${store.name}（${store.genre}）`, 50, 80);

  ctx.textAlign = "right";
  ctx.fillStyle = "#6b7280";
  ctx.font = "26px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.fillText(store.hours, W - 50, 80);
  ctx.textAlign = "left";

  // 画面ごとの中身
  if (screen === "home") {
    ctx.fillStyle = profile.accent;
    ctx.font = "bold 52px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.fillText("何を見ますか？", 50, 200);

    ctx.fillStyle = "#9ca3af";
    ctx.font = "34px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.fillText("下のボタンを選んでください", 50, 270);

    ctx.fillStyle = "#6b7280";
    ctx.font = "28px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    const who = profile.key === "none" ? "未設定" : profile.interests.join("・");
    ctx.fillText(`あなたの興味：${who}`, 50, 360);
    return canvas;
  }

  const title = screen === "store" ? "お店からのおすすめ" : "あなたの興味から";
  ctx.fillStyle = profile.accent;
  ctx.font = "bold 46px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.fillText(title, 50, 160);

  ctx.strokeStyle = "#3a3f47";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 190);
  ctx.lineTo(W - 50, 190);
  ctx.stroke();

  // 一覧を描く
  let rows = [];
  if (screen === "store") {
    rows = pickRecommends(store).map((item) => ({ item, note: item.tags.join(" / ") }));
  } else {
    const picked = pickForYou(store, profile);
    if (picked.length === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.font = "34px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
      ctx.fillText("興味に合うものが見つかりませんでした", 50, 280);
      ctx.fillText("プロフィールを切り替えてみてください", 50, 340);
      return canvas;
    }
    rows = picked.map(({ item, score }) => ({
      item,
      note: item.tags.filter((t) => profile.interests.includes(t)).join(" / ") + `　適合度 ${score}`,
    }));
  }

  rows.forEach((row, i) => {
    const y = 260 + i * 100;
    ctx.fillStyle = "#f5f5f4";
    ctx.font = "bold 40px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(row.item.name, 50, y);

    ctx.fillStyle = profile.accent;
    ctx.font = "bold 38px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`¥${row.item.price}`, W - 50, y);

    ctx.fillStyle = "#6b7280";
    ctx.font = "26px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(row.note, 50, y + 36);
  });

  return canvas;
}

// ── ボタンを描く ──
function drawButton(label, accent, filled) {
  const W = 460, H = 120;
  const canvas = newCanvas(W, H);
  const ctx = canvas.getContext("2d");

  if (filled) {
    ctx.fillStyle = accent;
    roundRect(ctx, 2, 2, W - 4, H - 4, 24);
    ctx.fill();
    ctx.fillStyle = "#0d0f12";
  } else {
    ctx.fillStyle = "#16181c";
    roundRect(ctx, 2, 2, W - 4, H - 4, 24);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    roundRect(ctx, 2, 2, W - 4, H - 4, 24);
    ctx.stroke();
    ctx.fillStyle = "#f5f5f4";
  }

  ctx.font = "bold 40px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, W / 2, H / 2);

  return canvas;
}

// ── canvasを板に貼る（共通処理）──
function applyTexture(planeEl, canvas) {
  const apply = () => {
    const mesh = planeEl.getObject3D("mesh");
    if (!mesh) {
      planeEl.addEventListener("loaded", apply, { once: true });
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

// ─────────────────────────────────────────────
// パネルの組み立て（本体1枚 + ボタン2枚）
// ─────────────────────────────────────────────
const panelParts = {}; // panelParts[index] = { board, btnL, btnR }

function ensureParts(targetIndex) {
  if (panelParts[targetIndex]) return panelParts[targetIndex];

  const targetEl = document.querySelector(
    `.lens-target[data-index="${targetIndex}"]`
  );
  if (!targetEl) return null;
  const panelEl = targetEl.querySelector(".lens-panel");

  // 本体
  const board = document.createElement("a-plane");
  board.setAttribute("width", "1");
  board.setAttribute("height", "0.547");   // 1024:560
  board.setAttribute("position", "0 0.12 0");
  panelEl.appendChild(board);

  // ボタン左右
  const mkBtn = (x) => {
    const b = document.createElement("a-plane");
    b.setAttribute("width", "0.46");
    b.setAttribute("height", "0.12");      // 460:120
    b.setAttribute("position", `${x} -0.23 0.01`);
    b.setAttribute("class", "clickable");
    panelEl.appendChild(b);
    return b;
  };
  const btnL = mkBtn(-0.25);
  const btnR = mkBtn(0.25);

  panelParts[targetIndex] = { board, btnL, btnR };
  return panelParts[targetIndex];
}

// ── ボタンが押された ──
function onButton(targetIndex, side) {
  const screen = screens[targetIndex] || "home";

  if (screen === "home") {
    screens[targetIndex] = side === "L" ? "store" : "you";
  } else {
    // 一覧画面では左=戻る、右=もう一方へ
    if (side === "L") {
      screens[targetIndex] = "home";
    } else {
      screens[targetIndex] = screen === "store" ? "you" : "store";
    }
  }
  renderPanel(targetIndex);
}

// ── 1つの看板を描画 ──
function renderPanel(targetIndex) {
  const store = STORES[targetIndex];
  if (!store) return;

  const parts = ensureParts(targetIndex);
  if (!parts) return;

  const profile = PROFILES.find((x) => x.key === current);
  const screen = screens[targetIndex] || "home";

  applyTexture(parts.board, drawBoard(store, profile, screen));

  // ボタンのラベルは画面によって変わる
  let labelL, labelR;
  if (screen === "home") {
    labelL = "お店のおすすめ";
    labelR = "あなたの興味";
  } else if (screen === "store") {
    labelL = "← 戻る";
    labelR = "あなたの興味";
  } else {
    labelL = "← 戻る";
    labelR = "お店のおすすめ";
  }

  applyTexture(parts.btnL, drawButton(labelL, profile.accent, false));
  applyTexture(parts.btnR, drawButton(labelR, profile.accent, screen === "home"));
}

function renderAllPanels() {
  STORES.forEach((_, i) => renderPanel(i));
}

// ─────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────
function buildChips() {
  const wrap = document.getElementById("chips");
  PROFILES.forEach((p) => {
    const b = document.createElement("button");
    b.className = "chip" + (p.key === current ? " active" : "");
    b.textContent = p.label;
    b.onclick = () => {
      current = p.key;
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      b.classList.add("active");
      renderAllPanels();
    };
    wrap.appendChild(b);
  });
}

const foundTargets = new Set(); // 今カメラに映っている看板

function wireTargetEvents() {
  const hint = document.getElementById("hint");
  const found = foundTargets;

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

// ─────────────────────────────────────────────
// タップ判定（自前で光線を飛ばす）
// ─────────────────────────────────────────────
// A-Frameの標準機能は「判定対象のリスト」を最初に作って持ち続けるため、
// 後からJSで生成したボタンを認識してくれないことがある。
// そこで自分で光線（レイ）を飛ばして当たり判定をする。
//
//   画面を触った位置 → カメラからその方向へ光線
//   → 板に当たったか判定 → 当たったボタンの処理を呼ぶ
//
// この仕組みは、将来ハンドトラッキングにしても同じ。
// 「指先から光線を飛ばす」に変わるだけ。
// ─────────────────────────────────────────────
function setupTapHandling() {
  const sceneEl = document.querySelector("a-scene");
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const handleTap = (clientX, clientY) => {
    const canvas = sceneEl.canvas;
    if (!canvas || !sceneEl.camera) return;

    // 画面座標 → -1〜1 の座標系に変換（3Dの世界の流儀）
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, sceneEl.camera);

    // 今カメラに映っている看板のボタンだけを判定対象にする
    const candidates = [];
    Object.keys(panelParts).forEach((idx) => {
      if (!foundTargets.has(String(idx))) return;
      const parts = panelParts[idx];
      [["L", parts.btnL], ["R", parts.btnR]].forEach(([side, el]) => {
        const mesh = el.getObject3D("mesh");
        if (mesh) {
          mesh.userData.lens = { idx: Number(idx), side };
          candidates.push(mesh);
        }
      });
    });

    if (candidates.length === 0) return;

    const hits = raycaster.intersectObjects(candidates, false);
    if (hits.length > 0) {
      const info = hits[0].object.userData.lens;
      onButton(info.idx, info.side);
    }
  };

  // ── 二重発火を防ぐ ──
  // スマホでは指を離すと touchend が発火し、その直後にブラウザが
  // 互換性のため click も発生させる。両方拾うと1回のタップで
  // 2回処理が走り、画面遷移が往復して「何も起きない」ように見える。
  // → touchend を処理したら、直後の click は無視する。
  let lastTouchAt = 0;

  sceneEl.addEventListener("touchend", (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    lastTouchAt = Date.now();
    handleTap(t.clientX, t.clientY);
  });

  // PCのクリック（動作確認用）
  sceneEl.addEventListener("click", (e) => {
    if (Date.now() - lastTouchAt < 700) return; // 直前のタッチの残響なので無視
    handleTap(e.clientX, e.clientY);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  buildChips();
  wireTargetEvents();
  setupTapHandling();
  startPolling();
});
