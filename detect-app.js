// ─────────────────────────────────────────────────────────
// detect-app.js — COCO-SSDで物体を種類認識する
// ─────────────────────────────────────────────────────────
// 流れ：
//   1. カメラを起動
//   2. COCO-SSDモデルを読み込む
//   3. 毎フレーム、映像から物体を検出
//   4. 見つかった物体に枠を描き、登録した情報があれば重ねる
// ─────────────────────────────────────────────────────────

// ── 認識した"種類"に対して出す情報 ──
// COCO-SSDが返す英語ラベルをキーにする。
// 80種類のうち、家にありそうで生活情報を出せそうなものを設定。
const INFO_BY_LABEL = {
  refrigerator: {
    jp: "冷蔵庫",
    lines: ["牛乳 期限あと2日", "作り置きカレー 今日中に", "買い足し：卵・味噌"],
  },
  microwave: {
    jp: "電子レンジ",
    lines: ["解凍：ごはん 2分", "オートメニュー 温め直し"],
  },
  oven: {
    jp: "オーブン/コンロ",
    lines: ["換気扇フィルター 月末交換", "ガス点検 来月"],
  },
  sink: {
    jp: "シンク",
    lines: ["生ゴミ 今夜まとめる", "水筒を洗う"],
  },
  book: {
    jp: "本",
    lines: ["積読：情熱プログラマー 次に読む"],
  },
  bottle: {
    jp: "ボトル",
    lines: ["水分補給 忘れずに"],
  },
  "dining table": {
    jp: "テーブル",
    lines: ["今日の最優先：LENS実験まとめ", "英語 30分"],
  },
  chair: {
    jp: "椅子",
    lines: ["姿勢に注意"],
  },
  "cell phone": {
    jp: "スマホ",
    lines: ["充電 確認"],
  },
  laptop: {
    jp: "PC",
    lines: ["バックアップ 週末に"],
  },
};

const LEVEL_COLOR = "#7dd3fc";
const MIN_SCORE = 0.55; // これ未満の自信のない検出は無視

let model = null;
const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const hint = document.getElementById("hint");
const fpsEl = document.getElementById("fps");

// ── カメラ起動 ──
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }, // 背面カメラ
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((r) => (video.onloadedmetadata = r));
  await video.play();

  // キャンバスを映像の実サイズに合わせる
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

// ── モデル読み込み ──
async function loadModel() {
  // lite_mobilenet_v2 は軽量版。非力な端末向け。
  model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
}

// ── 枠と情報を描く ──
function draw(predictions) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  predictions.forEach((p) => {
    if (p.score < MIN_SCORE) return;
    const [x, y, w, h] = p.bbox;
    const info = INFO_BY_LABEL[p.class];

    // 枠
    ctx.strokeStyle = info ? "#e0a020" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = info ? 5 : 2;
    ctx.strokeRect(x, y, w, h);

    // ラベル（種類名 + 自信度）
    const label = (info ? info.jp : p.class) + " " + Math.round(p.score * 100) + "%";
    ctx.font = "bold 30px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = info ? "#e0a020" : "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y - 40, tw + 20, 40);
    ctx.fillStyle = info ? "#0d0f12" : "#f5f5f4";
    ctx.fillText(label, x + 10, y - 10);

    // 登録情報があればパネルを重ねる
    if (info) {
      const px = x;
      const py = y + h + 10;
      const pw = 460;
      const ph = 40 + info.lines.length * 46;

      ctx.fillStyle = "rgba(13,15,18,0.9)";
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = "#e0a020";
      ctx.fillRect(px, py, 6, ph);

      ctx.fillStyle = "#f5f5f4";
      ctx.font = "32px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
      info.lines.forEach((line, i) => {
        ctx.fillText("・" + line, px + 22, py + 42 + i * 46);
      });
    }
  });
}

// ── 検出ループ ──
let lastT = performance.now();

async function detectLoop() {
  if (model && video.readyState === 4) {
    const predictions = await model.detect(video);
    draw(predictions);

    // FPS表示
    const now = performance.now();
    const fps = Math.round(1000 / (now - lastT));
    lastT = now;
    fpsEl.textContent = fps + " fps";
  }
  requestAnimationFrame(detectLoop);
}

// ── 起動 ──
(async function main() {
  try {
    hint.textContent = "カメラを起動しています…";
    await startCamera();
    hint.textContent = "モデルを読み込んでいます…";
    await loadModel();
    hint.textContent = "モノにカメラを向けてください";
    setTimeout(() => (hint.style.opacity = "0"), 3000);
    detectLoop();
  } catch (e) {
    hint.textContent = "エラー: " + e.message;
    console.error(e);
  }
})();
