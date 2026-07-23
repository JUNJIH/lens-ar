// ─────────────────────────────────────────────────────────
// yolo-app.js — YOLOv8をブラウザで動かす（onnxruntime-web）
// ─────────────────────────────────────────────────────────
// COCO-SSDとの最大の違い：後処理を自分で書く必要がある。
//
//   COCO-SSD : model.detect(video) → 完成した結果が返る
//   YOLOv8   : 生テンソル[1,84,8400] → 自分で解釈する
//
// 84 = 4(座標: cx,cy,w,h) + 80(クラスごとのスコア)
// 8400 = 検出候補の数（ほとんどはゴミ。スコアで絞る）
//
// 手順：
//   1. 映像を640x640に整える（縦横比を保つレターボックス）
//   2. RGB値を0〜1に正規化し、[1,3,640,640]の形に並べ替える
//   3. モデルに通す
//   4. 8400個の候補から、スコアの高いものを拾う
//   5. 重なった枠を除去する（NMS）
//   6. 座標を元の映像サイズに戻す
// ─────────────────────────────────────────────────────────

// COCOの80クラス（YOLOv8の出力順）
const COCO_CLASSES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
  "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
  "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
  "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
  "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
  "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair",
  "couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
  "remote","keyboard","cell phone","microwave","oven","toaster","sink",
  "refrigerator","book","clock","vase","scissors","teddy bear","hair drier",
  "toothbrush",
];

const JP = {
  refrigerator:"冷蔵庫", microwave:"電子レンジ", oven:"オーブン", sink:"流し",
  book:"本", bottle:"びん", cup:"カップ", bowl:"ボウル", chair:"椅子",
  couch:"ソファ", "dining table":"テーブル", bed:"ベッド", tv:"テレビ",
  laptop:"ノートPC", "cell phone":"スマホ", keyboard:"キーボード", mouse:"マウス",
  clock:"時計", vase:"花瓶", "potted plant":"観葉植物", "teddy bear":"ぬいぐるみ",
  person:"人", cat:"猫", dog:"犬", remote:"リモコン", toaster:"トースター",
  scissors:"はさみ", umbrella:"傘", backpack:"リュック", handbag:"バッグ",
  "wine glass":"ワイングラス", spoon:"スプーン", fork:"フォーク", knife:"ナイフ",
  banana:"バナナ", apple:"りんご", orange:"オレンジ", toothbrush:"歯ブラシ",
  "hair drier":"ドライヤー", toilet:"トイレ",
};

// モデルの入力サイズ（YOLOv8の標準）
const INPUT_SIZE = 640;
const CONF_THRESHOLD = 0.35;  // このスコア未満は捨てる
const IOU_THRESHOLD = 0.45;   // 重なりがこれ以上なら重複とみなす

// ── モデルの場所 ──
// 外部サイトから直接読むとリダイレクトやCORSで失敗するため、
// モデルファイルを自分のリポジトリに置いて読み込む。
//   ・外部サービスの都合に左右されない
//   ・CORSの問題が起きない
//   ・読み込みも速い
// 実務でも、外部から毎回大きなファイルを取るのは避けるのが定石。
//
// ★ 事前に yolov8n.onnx を lens-ar フォルダに置いてください（手順はREADME参照）
const MODEL_URL = "./yolov8n.onnx";

const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const bottombar = document.getElementById("bottombar");
const fpsEl = document.getElementById("fps");

let session = null;
let inputCanvas = null;  // 640x640に整える作業用
let inputCtx = null;
let detections = [];     // 最新の検出結果
let busy = false;

// ─────────────────────────────────────────────
// カメラ
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// モデル読み込み
// ─────────────────────────────────────────────
async function loadModel() {
  ort.env.wasm.numThreads = 1;  // モバイルでは1が安定
  ort.env.wasm.simd = true;

  // ── まず自分でダウンロードして進捗を出す ──
  // ORTに任せると進捗が分からず、失敗しても「準備中」のまま固まる。
  // 自分で取得すれば、404などのエラーもその場で分かる。
  bottombar.textContent = "モデルを取得しています…";

  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    throw new Error(
      `モデルを取得できません (HTTP ${res.status})。` +
      `yolov8n.onnx がリポジトリに置かれているか確認してください。`
    );
  }

  // 進捗を表示しながら読み込む
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) {
      const pct = Math.round((received / total) * 100);
      bottombar.textContent = `モデルを取得中… ${pct}% (${(received/1048576).toFixed(1)}MB)`;
    } else {
      bottombar.textContent = `モデルを取得中… ${(received/1048576).toFixed(1)}MB`;
    }
  }

  // 受け取った断片を1つにまとめる
  const buffer = new Uint8Array(received);
  let pos = 0;
  chunks.forEach((c) => { buffer.set(c, pos); pos += c.length; });

  bottombar.textContent = "モデルを初期化しています…（30秒ほどかかります）";
  session = await ort.InferenceSession.create(buffer.buffer, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });

  inputCanvas = document.createElement("canvas");
  inputCanvas.width = INPUT_SIZE;
  inputCanvas.height = INPUT_SIZE;
  inputCtx = inputCanvas.getContext("2d", { willReadFrequently: true });
}

// ─────────────────────────────────────────────
// 前処理：映像を640x640のテンソルに変換
// ─────────────────────────────────────────────
// 縦横比を保ったまま縮小し、余白を灰色で埋める（レターボックス）。
// これをしないと物体が歪んで精度が落ちる。
let letterbox = { scale: 1, dx: 0, dy: 0 };

function preprocess() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // 縦横比を保つ縮小率
  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
  const nw = Math.round(vw * scale);
  const nh = Math.round(vh * scale);
  const dx = Math.floor((INPUT_SIZE - nw) / 2);
  const dy = Math.floor((INPUT_SIZE - nh) / 2);
  letterbox = { scale, dx, dy };

  // 余白を灰色で塗ってから、中央に映像を描く
  inputCtx.fillStyle = "#727272";
  inputCtx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  inputCtx.drawImage(video, dx, dy, nw, nh);

  const imgData = inputCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;

  // [1, 3, 640, 640] の形に並べ替える
  // 画像は RGBA が横に並んでいるが、モデルは R全部→G全部→B全部 の順を要求する
  const size = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    input[i]            = imgData[i * 4]     / 255; // R
    input[i + size]     = imgData[i * 4 + 1] / 255; // G
    input[i + size * 2] = imgData[i * 4 + 2] / 255; // B
  }

  return new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

// ─────────────────────────────────────────────
// 後処理：生の出力から枠を組み立てる
// ─────────────────────────────────────────────
function postprocess(output) {
  const data = output.data;
  const dims = output.dims;        // [1, 84, 8400]
  const numClasses = dims[1] - 4;  // 84 - 4 = 80
  const numBoxes = dims[2];        // 8400

  const boxes = [];

  for (let i = 0; i < numBoxes; i++) {
    // 各クラスのスコアから最大のものを探す
    let maxScore = 0;
    let classId = -1;
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numBoxes + i];
      if (score > maxScore) {
        maxScore = score;
        classId = c;
      }
    }
    if (maxScore < CONF_THRESHOLD) continue;

    // 座標は中心x,中心y,幅,高さ の形で入っている
    const cx = data[0 * numBoxes + i];
    const cy = data[1 * numBoxes + i];
    const w  = data[2 * numBoxes + i];
    const h  = data[3 * numBoxes + i];

    // レターボックスの分を戻して、元の映像座標へ
    const x = (cx - w / 2 - letterbox.dx) / letterbox.scale;
    const y = (cy - h / 2 - letterbox.dy) / letterbox.scale;
    const bw = w / letterbox.scale;
    const bh = h / letterbox.scale;

    boxes.push({ x, y, w: bw, h: bh, score: maxScore, classId });
  }

  return nms(boxes);
}

// 重なった枠を除去する（Non-Maximum Suppression）
// 同じ物体に対して複数の枠が出るので、一番スコアが高いものだけ残す。
function nms(boxes) {
  boxes.sort((a, b) => b.score - a.score);
  const keep = [];

  while (boxes.length > 0) {
    const best = boxes.shift();
    keep.push(best);
    // bestと大きく重なるものを捨てる
    boxes = boxes.filter((b) => {
      if (b.classId !== best.classId) return true; // 別クラスは残す
      return iou(best, b) < IOU_THRESHOLD;
    });
  }
  return keep;
}

// 2つの枠の重なり具合（0〜1）
function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// ─────────────────────────────────────────────
// 推論ループ
// ─────────────────────────────────────────────
let lastInferT = performance.now();

async function detectLoop() {
  if (session && !busy && video.readyState === 4) {
    busy = true;
    try {
      const input = preprocess();
      const feeds = {};
      feeds[session.inputNames[0]] = input;
      const results = await session.run(feeds);
      const output = results[session.outputNames[0]];
      detections = postprocess(output);

      const now = performance.now();
      const ms = Math.round(now - lastInferT);
      lastInferT = now;
      fpsEl.textContent = ms + "ms / " + detections.length + "件";
    } catch (e) {
      console.error("推論エラー:", e);
      bottombar.textContent = "推論エラー: " + e.message;
    }
    busy = false;
  }
  setTimeout(detectLoop, 50);
}

// ─────────────────────────────────────────────
// 描画
// ─────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  detections.forEach((d) => {
    const name = COCO_CLASSES[d.classId] || "?";
    const jp = JP[name] || name;

    ctx.strokeStyle = "#e0a020";
    ctx.lineWidth = 4;
    ctx.strokeRect(d.x, d.y, d.w, d.h);

    const text = jp + " " + Math.round(d.score * 100) + "%";
    ctx.font = "bold 30px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "#e0a020";
    ctx.fillRect(d.x, d.y - 40, tw + 20, 40);
    ctx.fillStyle = "#0d0f12";
    ctx.fillText(text, d.x + 10, d.y - 10);
  });
}

function renderLoop() {
  draw();
  requestAnimationFrame(renderLoop);
}

// ─────────────────────────────────────────────
(async function main() {
  try {
    bottombar.textContent = "カメラを起動しています…";
    await startCamera();
    bottombar.textContent = "YOLOv8モデルを読み込んでいます…（初回は時間がかかります）";
    await loadModel();
    bottombar.textContent = "モノにカメラを向けてください（COCO-SSDと比べてみてください）";
    renderLoop();
    detectLoop();
  } catch (e) {
    // エラーは必ず画面に出す（コンソールを見られない環境でも分かるように）
    bottombar.style.color = "#e8462d";
    bottombar.style.fontWeight = "700";
    bottombar.textContent = "エラー: " + e.message;
    console.error(e);
  }
})();
