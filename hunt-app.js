// ─────────────────────────────────────────────────────────
// hunt-app.js — 部屋の宝探し（第1段階：1端末で完結）
// ─────────────────────────────────────────────────────────
// かくす：物体をタップして選び、ヒント文を書いて保存
// さがす：部屋を見回す。近さが数値で出る。隠し場所を見つけると発見
//
// 保存はlocalStorage（この端末の中だけ）。
// 第2段階でサーバー保存に置き換え、2端末で遊べるようにする。
// ─────────────────────────────────────────────────────────

const STORAGE_KEY = "lens.hunt.treasures";

// 場所の手がかり（Day6の場所判定を流用）
const PLACE_RULES = [
  {
    id: "kitchen", name: "キッチン",
    clues: { sink:3, oven:3, microwave:3, refrigerator:2, bottle:1, cup:1, bowl:1, knife:1, spoon:1, fork:1, "wine glass":1, toaster:2 },
  },
  {
    id: "living", name: "リビング",
    clues: { couch:3, tv:3, remote:2, "potted plant":1, chair:1, "dining table":1, clock:1, vase:1, book:1 },
  },
  {
    id: "bedroom", name: "寝室",
    clues: { bed:3, "teddy bear":2, clock:1, book:1, laptop:1 },
  },
  {
    id: "desk", name: "デスクまわり",
    clues: { laptop:3, keyboard:3, mouse:2, "cell phone":1, book:1, chair:1, cup:1 },
  },
];

const JP = {
  refrigerator:"冷蔵庫", microwave:"電子レンジ", oven:"オーブン", sink:"流し",
  book:"本", bottle:"びん", cup:"カップ", bowl:"ボウル", chair:"椅子",
  couch:"ソファ", "dining table":"テーブル", bed:"ベッド", tv:"テレビ",
  laptop:"ノートPC", "cell phone":"スマホ", keyboard:"キーボード", mouse:"マウス",
  clock:"時計", vase:"花瓶", "potted plant":"観葉植物", "teddy bear":"ぬいぐるみ",
  backpack:"リュック", umbrella:"傘", handbag:"バッグ", scissors:"はさみ",
  remote:"リモコン", toaster:"トースター", "wine glass":"ワイングラス",
  spoon:"スプーン", fork:"フォーク", knife:"ナイフ", banana:"バナナ",
  apple:"りんご", orange:"オレンジ", toothbrush:"歯ブラシ", "hair drier":"ドライヤー",
};

const MIN_SCORE = 0.5;
const KEEP_MS = 1200;
const SMOOTH = 0.18;
const DETECT_INTERVAL = 200;
const DETECT_WIDTH = 480;

let scaleRatio = 1, scratch = null;
const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const bottombar = document.getElementById("bottombar");
const countEl = document.getElementById("count");

const tracked = {};
let worker = null, workerReady = false, sending = false;

let mode = "hide";       // "hide" | "seek"
let treasures = [];      // 隠された宝の一覧
let pendingLabel = null; // 隠す確認中の物体

// ─────────────────────────────────────────────
// 保存・読み込み
// ─────────────────────────────────────────────
function loadTreasures() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    treasures = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("読み込み失敗:", e);
    treasures = [];
  }
  updateCount();
}

function saveTreasures() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(treasures));
  } catch (e) {
    console.error("保存失敗:", e);
  }
  updateCount();
}

function updateCount() {
  const left = treasures.filter((t) => !t.found).length;
  countEl.textContent = "宝 " + left;
}

// ─────────────────────────────────────────────
// カメラ・検出（これまでと同じ構成）
// ─────────────────────────────────────────────
function startWorker() {
  worker = new Worker("detect-worker.js");
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "ready") {
      workerReady = true;
      updateBottom();
    } else if (msg.type === "result") {
      updateTracked(msg.predictions);
      sending = false;
    } else if (msg.type === "error") {
      console.error("検出エラー:", msg.message);
      sending = false;
    }
  };
  worker.onerror = (e) => console.error("Worker起動エラー:", e.message);
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((r) => (video.onloadedmetadata = r));
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

async function sendFrame() {
  if (workerReady && !sending && video.readyState === 4) {
    sending = true;
    try {
      if (!scratch) {
        scaleRatio = DETECT_WIDTH / video.videoWidth;
        scratch = document.createElement("canvas");
        scratch.width = DETECT_WIDTH;
        scratch.height = Math.round(video.videoHeight * scaleRatio);
      }
      scratch.getContext("2d").drawImage(video, 0, 0, scratch.width, scratch.height);
      const bitmap = await createImageBitmap(scratch);
      worker.postMessage({ type: "frame", bitmap }, [bitmap]);
    } catch (e) {
      console.error("送信エラー:", e);
      sending = false;
    }
  }
  setTimeout(sendFrame, DETECT_INTERVAL);
}

function lerpBox(a, b, t) {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t, a[3]+(b[3]-a[3])*t];
}

function updateTracked(predictions) {
  const now = performance.now();
  predictions.forEach((p) => {
    if (p.score < MIN_SCORE) return;
    const box = [p.bbox[0]/scaleRatio, p.bbox[1]/scaleRatio, p.bbox[2]/scaleRatio, p.bbox[3]/scaleRatio];
    const prev = tracked[p.class];
    tracked[p.class] = { bbox: box, score: p.score, lastSeen: now, shown: prev ? prev.shown : box };
  });
  Object.keys(tracked).forEach((label) => {
    if (now - tracked[label].lastSeen > KEEP_MS) delete tracked[label];
  });
}

// ─────────────────────────────────────────────
// 近さの計算（部屋単位）
// ─────────────────────────────────────────────
// 視界に入れる＝ほぼ答えなので、その一歩手前のヒントとして
// 「同じ部屋の手がかりがどれだけ見えているか」を数値化する。
// 手がかりが多く見えるほど数値が小さくなる＝近い。
function calcNearness(treasure) {
  const visible = Object.keys(tracked);
  if (visible.length === 0) return null;

  // 宝が隠された部屋を特定
  const room = PLACE_RULES.find((r) => r.id === treasure.roomId);
  if (!room) return null;

  // その部屋の手がかりが、今どれだけ見えているか
  let score = 0;
  visible.forEach((label) => {
    if (room.clues[label]) score += room.clues[label];
  });

  // 点数を「距離っぽい数値」に変換する
  //   手がかりが多く見える → 数値が小さい（近い）
  //   何も見えない        → 数値が大きい（遠い）
  const distance = Math.max(10, 220 - score * 25);
  return { distance, score };
}

// ─────────────────────────────────────────────
// 描画
// ─────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const labels = Object.keys(tracked);

  labels.forEach((label) => {
    const t = tracked[label];
    t.shown = lerpBox(t.shown, t.bbox, SMOOTH);
    const [x, y, w, h] = t.shown;

    const hiddenHere = treasures.find((tr) => tr.label === label && !tr.found);
    const jp = JP[label] || label;

    if (mode === "hide") {
      // かくすモード：タップできる候補として全部見せる
      const already = treasures.some((tr) => tr.label === label && !tr.found);
      ctx.strokeStyle = already ? "#37b58a" : "#7dd3fc";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);

      const text = already ? jp + "（隠し済み）" : jp + " ← タップで隠す";
      ctx.font = "bold 30px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = already ? "#37b58a" : "rgba(13,15,18,0.9)";
      ctx.fillRect(x, y - 44, tw + 24, 44);
      ctx.fillStyle = already ? "#0d0f12" : "#7dd3fc";
      ctx.fillText(text, x + 12, y - 12);

    } else {
      // さがすモード：宝の場所は教えない。ただし見つけたら発見
      if (hiddenHere) {
        // 発見演出
        ctx.strokeStyle = "#e0a020";
        ctx.lineWidth = 8;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "rgba(224,160,32,0.25)";
        ctx.fillRect(x, y, w, h);
        // 実際の発見処理は下のcheckFoundで行う
      } else {
        // ただのモノは薄く出す（探索の手がかりにはなる）
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
      }
    }
  });

  if (mode === "seek") drawSeekHUD();
}

// さがすモードの情報表示
function drawSeekHUD() {
  const remaining = treasures.filter((t) => !t.found);
  if (remaining.length === 0) return;

  // 一番近い宝を選ぶ
  let best = null;
  remaining.forEach((t) => {
    const n = calcNearness(t);
    if (n && (!best || n.distance < best.n.distance)) best = { t, n };
  });

  const x = 20, y = 100, w = Math.min(overlay.width - 40, 620);
  const h = 190;

  ctx.fillStyle = "rgba(13,15,18,0.88)";
  ctx.fillRect(x, y, w, h);

  const target = best ? best.t : remaining[0];

  // ヒント文
  ctx.fillStyle = "#e0a020";
  ctx.font = "bold 26px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("ヒント", x + 20, y + 40);

  ctx.fillStyle = "#f5f5f4";
  ctx.font = "32px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.fillText(target.hint || "（ヒントなし）", x + 20, y + 82);

  // 近さ
  if (best) {
    const d = Math.round(best.n.distance);
    const color = d < 60 ? "#e8462d" : d < 120 ? "#e0a020" : "#7dd3fc";
    const word = d < 60 ? "あつい！" : d < 120 ? "ちかい" : "とおい";

    ctx.fillStyle = "#6b7280";
    ctx.font = "24px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.fillText("近さ", x + 20, y + 130);

    ctx.fillStyle = color;
    ctx.font = "bold 46px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.fillText(d + "  " + word, x + 20, y + 172);
  } else {
    ctx.fillStyle = "#6b7280";
    ctx.font = "26px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.fillText("何か写すと近さが分かります", x + 20, y + 160);
  }
}

// 宝を見つけたか判定
function checkFound() {
  if (mode !== "seek") return;
  Object.keys(tracked).forEach((label) => {
    const t = treasures.find((tr) => tr.label === label && !tr.found);
    if (t) {
      t.found = true;
      t.foundAt = new Date().toISOString();
      saveTreasures();
      showFound(t);
    }
  });
}

function showFound(t) {
  const el = document.getElementById("found");
  document.getElementById("foundText").textContent =
    (JP[t.label] || t.label) + " に隠されていました";
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

function renderLoop() {
  draw();
  checkFound();
  requestAnimationFrame(renderLoop);
}

// ─────────────────────────────────────────────
// 操作
// ─────────────────────────────────────────────
// かくすモードで画面をタップ → その位置の物体を選ぶ
function setupTap() {
  const stage = document.getElementById("stage");
  let lastTouch = 0;

  const handle = (cx, cy) => {
    if (mode !== "hide") return;

    // 画面座標を映像座標に変換
    const rect = overlay.getBoundingClientRect();
    // object-fit: cover の分を考慮して比率で換算
    const sx = (cx - rect.left) / rect.width * overlay.width;
    const sy = (cy - rect.top) / rect.height * overlay.height;

    // タップ位置に重なっている物体を探す
    const hit = Object.keys(tracked).find((label) => {
      const [x, y, w, h] = tracked[label].shown;
      return sx >= x && sx <= x + w && sy >= y && sy <= y + h;
    });

    if (hit) openSheet(hit);
  };

  stage.addEventListener("touchend", (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    lastTouch = Date.now();
    handle(t.clientX, t.clientY);
  });
  stage.addEventListener("click", (e) => {
    if (Date.now() - lastTouch < 700) return; // 二重発火を防ぐ（Day3の学び）
    handle(e.clientX, e.clientY);
  });
}

function currentRoom() {
  const visible = Object.keys(tracked);
  let best = null, bestScore = 0;
  PLACE_RULES.forEach((rule) => {
    let score = 0;
    visible.forEach((l) => { if (rule.clues[l]) score += rule.clues[l]; });
    if (score > bestScore) { best = rule; bestScore = score; }
  });
  return best;
}

function openSheet(label) {
  pendingLabel = label;
  const room = currentRoom();
  document.getElementById("sheetTitle").textContent =
    (JP[label] || label) + " に隠しますか？";
  document.getElementById("sheetSub").textContent =
    room ? `場所：${room.name} と判定されています` : "場所：判定できませんでした";
  document.getElementById("hintInput").value = "";
  document.getElementById("sheet").classList.add("show");
}

function closeSheet() {
  pendingLabel = null;
  document.getElementById("sheet").classList.remove("show");
}

function setupUI() {
  const hideTab = document.getElementById("hideTab");
  const seekTab = document.getElementById("seekTab");

  hideTab.onclick = () => {
    mode = "hide";
    hideTab.classList.add("active");
    seekTab.classList.remove("active");
    updateBottom();
  };
  seekTab.onclick = () => {
    mode = "seek";
    seekTab.classList.add("active");
    hideTab.classList.remove("active");
    updateBottom();
  };

  document.getElementById("cancelHide").onclick = closeSheet;

  document.getElementById("doHide").onclick = () => {
    if (!pendingLabel) return;
    const room = currentRoom();
    const hint = document.getElementById("hintInput").value.trim();
    treasures.push({
      id: Date.now().toString(),
      label: pendingLabel,
      roomId: room ? room.id : null,
      hint: hint || "（ヒントなし）",
      found: false,
      hiddenAt: new Date().toISOString(),
    });
    saveTreasures();
    closeSheet();
  };
}

function updateBottom() {
  if (!workerReady) {
    bottombar.textContent = "検出エンジンを準備しています…";
    return;
  }
  if (mode === "hide") {
    bottombar.textContent = "隠したいモノにカメラを向けて、画面をタップしてください。";
  } else {
    const left = treasures.filter((t) => !t.found).length;
    bottombar.textContent = left === 0
      ? "宝がありません。「かくす」で隠してください。"
      : `残り ${left} 個。部屋を見回して探してください。`;
  }
}

// ─────────────────────────────────────────────
(async function main() {
  try {
    loadTreasures();
    setupUI();
    setupTap();
    bottombar.textContent = "カメラを起動しています…";
    await startCamera();
    bottombar.textContent = "検出エンジンを準備しています…";
    startWorker();
    renderLoop();
    sendFrame();
  } catch (e) {
    bottombar.textContent = "エラー: " + e.message;
    console.error(e);
  }
})();
