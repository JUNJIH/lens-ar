// ─────────────────────────────────────────────────────────
// detect-app.js — COCO-SSD 物体認識（安定化版）
// ─────────────────────────────────────────────────────────
// Day5の改善：認識が不安定な問題に対処。
//   ① 通常モデルに変更 + 検出解像度を上げる → 遠くても認識しやすく
//   ② 検出結果を数フレーム保持して均す      → ちらつき・消失を吸収
//   ③ 一度見つけた枠は滑らかに追従（急に飛ばない）
// ─────────────────────────────────────────────────────────

const INFO_BY_LABEL = {
  refrigerator: { jp: "冷蔵庫", lines: ["牛乳 期限あと2日", "作り置きカレー 今日中に", "買い足し：卵・味噌"] },
  microwave:    { jp: "電子レンジ", lines: ["解凍：ごはん 2分", "オートメニュー 温め直し"] },
  oven:         { jp: "オーブン/コンロ", lines: ["換気扇フィルター 月末交換"] },
  sink:         { jp: "シンク", lines: ["生ゴミ 今夜まとめる", "水筒を洗う"] },
  book:         { jp: "本", lines: ["積読：情熱プログラマー 次に読む"] },
  bottle:       { jp: "ボトル", lines: ["水分補給 忘れずに"] },
  "dining table": { jp: "テーブル", lines: ["今日の最優先：LENS実験まとめ", "英語 30分"] },
  chair:        { jp: "椅子", lines: ["姿勢に注意"] },
  "cell phone": { jp: "スマホ", lines: ["充電 確認"] },
  laptop:       { jp: "PC", lines: ["バックアップ 週末に"] },
  "potted plant": { jp: "観葉植物", lines: ["水やり 2日に1回"] },
  tv:           { jp: "テレビ", lines: ["見過ぎ注意"] },
};

const MIN_SCORE = 0.5;        // 検出を採用する最低スコア
const KEEP_MS = 700;          // 見失っても、この時間は枠を保持する
const SMOOTH = 0.18;        // 枠の追従。描画60fpsに合わせ、より滑らかに

let model = null;
const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const hint = document.getElementById("hint");
const fpsEl = document.getElementById("fps");

// ── 安定化のための記憶 ──
// ラベルごとに「最後に見た枠・時刻・表示中の枠」を覚えておく
const tracked = {}; // { label: { bbox, score, lastSeen, shown:[x,y,w,h] } }

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

async function loadModel() {
  // lite_mobilenet_v2（軽量・低精度）→ mobilenet_v2（標準・精度高め）に変更
  // 遠くの物や小さい物の認識が改善する。少し重くなるトレードオフ。
  model = await cocoSsd.load({ base: "mobilenet_v2" });
}

// 2つの枠を滑らかに混ぜる（急なジャンプを防ぐ）
function lerpBox(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

// ── 検出結果を記憶に反映（均す）──
function updateTracked(predictions) {
  const now = performance.now();

  // 今フレームで見つかったものを記録
  predictions.forEach((p) => {
    if (p.score < MIN_SCORE) return;
    const prev = tracked[p.class];
    tracked[p.class] = {
      bbox: p.bbox,
      score: p.score,
      lastSeen: now,
      shown: prev ? prev.shown : p.bbox, // 表示枠は前回位置から滑らかに動かす
    };
  });

  // KEEP_MS 以上見ていないものは忘れる（＝枠を消す）
  Object.keys(tracked).forEach((label) => {
    if (now - tracked[label].lastSeen > KEEP_MS) {
      delete tracked[label];
    }
  });
}

function draw() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  Object.keys(tracked).forEach((label) => {
    const t = tracked[label];
    // 表示枠を、実際の検出枠へ少しずつ近づける（ちらつき・ジャンプ防止）
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
      const py = y + h + 10;
      const pw = 470;
      const ph = 30 + info.lines.length * 46;
      ctx.fillStyle = "rgba(13,15,18,0.9)";
      ctx.fillRect(x, py, pw, ph);
      ctx.fillStyle = "#e0a020";
      ctx.fillRect(x, py, 6, ph);
      ctx.fillStyle = "#f5f5f4";
      ctx.font = "32px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
      info.lines.forEach((line, i) => {
        ctx.fillText("・" + line, x + 22, py + 40 + i * 46);
      });
    }
  });
}

// ─────────────────────────────────────────────
// 検出と描画を分離する（カクつき対策の肝）
// ─────────────────────────────────────────────
// 描画ループ：毎フレーム(60fps)回す。軽いので滑らか。
// 検出ループ：裏でゆっくり回す。重くても描画に影響しない。
// → 検出の遅さが画面のカクつきになるのを防ぐ。
// ─────────────────────────────────────────────

let lastT = performance.now();

// 【描画ループ】止まらず毎フレーム回る。tracked(記憶)を滑らかに描くだけ。
function renderLoop() {
  draw();
  const now = performance.now();
  fpsEl.textContent = "描画 " + Math.round(1000 / (now - lastT)) + " fps";
  lastT = now;
  requestAnimationFrame(renderLoop);
}

// 【検出ループ】裏で回す。1回終わったら次を始める（詰まらせない）。
async function detectLoop() {
  if (model && video.readyState === 4) {
    try {
      const predictions = await model.detect(video);
      updateTracked(predictions);
    } catch (e) {
      console.error("検出エラー:", e);
    }
  }
  // 少し間隔を空けて次の検出（端末に余裕を持たせる）
  setTimeout(detectLoop, 120);
}

(async function main() {
  try {
    hint.textContent = "カメラを起動しています…";
    await startCamera();
    hint.textContent = "モデルを読み込んでいます…（標準モデルは少し時間がかかります）";
    await loadModel();
    hint.textContent = "モノにカメラを向けてください";
    setTimeout(() => (hint.style.opacity = "0"), 3000);
    renderLoop();  // 描画は即開始（滑らかに）
    detectLoop();  // 検出は裏で開始
  } catch (e) {
    hint.textContent = "エラー: " + e.message;
    console.error(e);
  }
})();
