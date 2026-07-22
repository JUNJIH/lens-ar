// ─────────────────────────────────────────────────────────
// detect2-app.js — メイン側（Worker版）
// ─────────────────────────────────────────────────────────
// 役割分担：
//   メイン(ここ) … カメラ映像・枠の描画・映像を画像に切り出してWorkerへ送る
//   Worker      … 重い検出だけ（別レーンなので映像を止めない）
//
// 映像の切り出しには createImageBitmap を使う。
// これは軽い処理なので、メインを長く占有しない。
// ─────────────────────────────────────────────────────────

const INFO_BY_LABEL = {
  refrigerator: { jp: "冷蔵庫", lines: ["牛乳 期限あと2日", "作り置きカレー 今日中に", "買い足し：卵・味噌"] },
  microwave:    { jp: "電子レンジ", lines: ["解凍：ごはん 2分"] },
  sink:         { jp: "シンク", lines: ["生ゴミ 今夜まとめる", "水筒を洗う"] },
  book:         { jp: "本", lines: ["積読：情熱プログラマー 次に読む"] },
  bottle:       { jp: "ボトル", lines: ["水分補給 忘れずに"] },
  "dining table": { jp: "テーブル", lines: ["今日の最優先：LENS実験まとめ", "英語 30分"] },
  chair:        { jp: "椅子", lines: ["姿勢に注意"] },
  "cell phone": { jp: "スマホ", lines: ["充電 確認"] },
  laptop:       { jp: "PC", lines: ["バックアップ 週末に"] },
  tv:           { jp: "テレビ", lines: ["見過ぎ注意"] },
  "potted plant": { jp: "観葉植物", lines: ["水やり 2日に1回"] },
};

// ─────────────────────────────────────────────────────────
// 場所の判定（モノの組み合わせから場所を推定する）
// ─────────────────────────────────────────────────────────
// COCO-SSDが認識できるのは「モノ」80種類。「キッチン」「玄関」は
// 場所なのでリストに無い＝単体では認識できない。
//
// そこで人間と同じ判断をする：
//   シンクがあって、冷蔵庫があって、電子レンジがある → ここはキッチンだ
//
// 各場所に「手がかりのモノ」と重みを持たせ、今見えているモノと
// 照合して点数をつける。しきい値を超えたらその場所だと判定する。
//
// ※ 玄関は現状保留。80種類に玄関らしいモノがほとんど無く、
//   誤認識が多いため。手がかりが見つかったらここに足せば動く。
// ─────────────────────────────────────────────────────────
const PLACE_RULES = [
  {
    id: "kitchen",
    name: "キッチン",
    // モノ : 重み（そのモノがどれだけ「ここらしさ」を示すか）
    clues: {
      sink: 3,
      oven: 3,
      microwave: 3,
      refrigerator: 2,
      bottle: 1,
      cup: 1,
      bowl: 1,
      "wine glass": 1,
      knife: 1,
      spoon: 1,
    },
    threshold: 4, // この点数以上で「キッチン」と判定
    items: [
      { text: "生ゴミ 今夜まとめる", level: "todo" },
      { text: "水筒を洗って乾かす", level: "todo" },
      { text: "米 残りわずか（次回購入）", level: "warn" },
    ],
  },
  // ここに玄関やリビングを足せば、そのまま動く
];

const LEVEL_COLOR = { warn: "#e8462d", todo: "#e0a020", info: "#7dd3fc" };

// 場所の判定結果（ちらつき防止のため保持する）
let currentPlace = null;
let placeLastSeen = 0;
const PLACE_KEEP_MS = 3000; // 判定は3秒保持する（モノが一瞬外れても場所は変わらない）

// 今見えているモノから場所を判定する
function judgePlace() {
  const visible = Object.keys(tracked);
  let best = null;
  let bestScore = 0;

  PLACE_RULES.forEach((rule) => {
    let score = 0;
    visible.forEach((label) => {
      if (rule.clues[label]) score += rule.clues[label];
    });
    if (score >= rule.threshold && score > bestScore) {
      best = rule;
      bestScore = score;
    }
  });

  const now = performance.now();
  if (best) {
    currentPlace = { rule: best, score: bestScore };
    placeLastSeen = now;
  } else if (now - placeLastSeen > PLACE_KEEP_MS) {
    // しばらく手がかりが無ければ場所判定を解除
    currentPlace = null;
  }
}

// 場所パネルを画面上部に描く（モノの枠とは別レイヤー）
function drawPlacePanel() {
  if (!currentPlace) return;
  const { rule, score } = currentPlace;

  const x = 30, y = 30, w = 620;
  const h = 90 + rule.items.length * 52;

  ctx.fillStyle = "rgba(13,15,18,0.88)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#7dd3fc";
  ctx.fillRect(x, y, 8, h);

  ctx.fillStyle = "#7dd3fc";
  ctx.font = "bold 40px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`ここは ${rule.name}`, x + 26, y + 56);

  ctx.fillStyle = "#6b7280";
  ctx.font = "24px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
  ctx.fillText(`確からしさ ${score}`, x + w - 160, y + 56);

  rule.items.forEach((item, i) => {
    const iy = y + 108 + i * 52;
    ctx.fillStyle = LEVEL_COLOR[item.level] || "#9ca3af";
    ctx.beginPath();
    ctx.arc(x + 38, iy - 10, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5f5f4";
    ctx.font = "30px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    ctx.fillText(item.text, x + 60, iy);
  });
}

const MIN_SCORE = 0.5;
const KEEP_MS = 800;
const SMOOTH = 0.18;
const DETECT_INTERVAL = 200;   // 何msごとにWorkerへ画像を送るか（頻度を半分に）
const DETECT_WIDTH = 480;      // 検出用に縮小する幅（小さいほど軽い）
let scaleRatio = 1;            // 縮小率（枠の座標を元サイズに戻すのに使う）
let scratch = null;           // 縮小用の作業キャンバス（使い回す）

const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const hint = document.getElementById("hint");
const fpsEl = document.getElementById("fps");

const tracked = {};
let worker = null;
let workerReady = false;
let sending = false;

// ── Worker起動 ──
function startWorker() {
  worker = new Worker("detect-worker.js");
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "ready") {
      workerReady = true;
      hint.textContent = "モノにカメラを向けてください";
      setTimeout(() => (hint.style.opacity = "0"), 3000);
    } else if (msg.type === "result") {
      updateTracked(msg.predictions);
      sending = false;
    } else if (msg.type === "error") {
      console.error("Worker検出エラー:", msg.message);
      sending = false;
    }
  };
  worker.onerror = (e) => {
    console.error("Worker起動エラー:", e.message);
    hint.textContent = "Workerエラー: " + e.message;
  };
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

function lerpBox(a, b, t) {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t, a[3]+(b[3]-a[3])*t];
}

function updateTracked(predictions) {
  const now = performance.now();
  predictions.forEach((p) => {
    if (p.score < MIN_SCORE) return;
    // Workerには縮小画像を送ったので、枠を元の映像サイズに戻す
    const box = [
      p.bbox[0] / scaleRatio,
      p.bbox[1] / scaleRatio,
      p.bbox[2] / scaleRatio,
      p.bbox[3] / scaleRatio,
    ];
    const prev = tracked[p.class];
    tracked[p.class] = { bbox: box, score: p.score, lastSeen: now, shown: prev ? prev.shown : box };
  });
  Object.keys(tracked).forEach((label) => {
    if (now - tracked[label].lastSeen > KEEP_MS) delete tracked[label];
  });
}

function draw() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // モノの組み合わせから場所を判定する
  judgePlace();

  Object.keys(tracked).forEach((label) => {
    const t = tracked[label];
    t.shown = lerpBox(t.shown, t.bbox, SMOOTH);
    const [x, y, w, h] = t.shown;
    const info = INFO_BY_LABEL[label];

    ctx.strokeStyle = info ? "#e0a020" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = info ? 5 : 2;
    ctx.strokeRect(x, y, w, h);

    const labelText = (info ? info.jp : label) + " " + Math.round(t.score * 100) + "%";
    ctx.font = "bold 30px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    const tw = ctx.measureText(labelText).width;
    ctx.fillStyle = info ? "#e0a020" : "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y - 40, tw + 20, 40);
    ctx.fillStyle = info ? "#0d0f12" : "#f5f5f4";
    ctx.fillText(labelText, x + 10, y - 10);

    if (info) {
      const py = y + h + 10, pw = 470, ph = 30 + info.lines.length * 46;
      ctx.fillStyle = "rgba(13,15,18,0.9)";
      ctx.fillRect(x, py, pw, ph);
      ctx.fillStyle = "#e0a020";
      ctx.fillRect(x, py, 6, ph);
      ctx.fillStyle = "#f5f5f4";
      ctx.font = "32px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
      info.lines.forEach((line, i) => ctx.fillText("・" + line, x + 22, py + 40 + i * 46));
    }
  });

  // 場所パネルは最後に描く（モノの枠より手前に出す）
  drawPlacePanel();
}

// ── 映像を縮小して切り出し、Workerへ送る（定期）──
// 検出には高解像度は要らない。小さく縮小してから送ることで
// 「切り出し・送信・検出」すべてを軽くする。
// 縮小率(scaleRatio)を覚えておき、返ってきた枠を元サイズに戻す。
async function sendFrame() {
  if (workerReady && !sending && video.readyState === 4) {
    sending = true;
    try {
      // 作業キャンバスを一度だけ用意
      if (!scratch) {
        scaleRatio = DETECT_WIDTH / video.videoWidth;
        scratch = document.createElement("canvas");
        scratch.width = DETECT_WIDTH;
        scratch.height = Math.round(video.videoHeight * scaleRatio);
      }
      // 縮小して描く（この描画自体は小さいので軽い）
      const sctx = scratch.getContext("2d");
      sctx.drawImage(video, 0, 0, scratch.width, scratch.height);

      // 縮小済みキャンバスから画像を作ってWorkerへ（所有権ごと渡す）
      const bitmap = await createImageBitmap(scratch);
      worker.postMessage({ type: "frame", bitmap }, [bitmap]);
    } catch (e) {
      console.error("フレーム送信エラー:", e);
      sending = false;
    }
  }
  setTimeout(sendFrame, DETECT_INTERVAL);
}

// ── 描画ループ（メインで滑らかに）──
let lastT = performance.now();
function renderLoop() {
  draw();
  const now = performance.now();
  fpsEl.textContent = "描画 " + Math.round(1000 / (now - lastT)) + " fps";
  lastT = now;
  requestAnimationFrame(renderLoop);
}

(async function main() {
  try {
    hint.textContent = "カメラを起動しています…";
    await startCamera();
    hint.textContent = "検出エンジンを準備しています…";
    startWorker();
    renderLoop();
    sendFrame();
  } catch (e) {
    hint.textContent = "エラー: " + e.message;
    console.error(e);
  }
})();
