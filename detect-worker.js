// ─────────────────────────────────────────────────────────
// detect-worker.js — 別スレッド（Worker）で検出だけを担当
// ─────────────────────────────────────────────────────────
// ここはメインとは別レーン。画面(video/canvas)には触れない。
// メインから送られた「画像データ」を受け取り、検出して結果を返す。
// ─────────────────────────────────────────────────────────

// Worker内でTensorFlow.jsとCOCO-SSDを読み込む
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
importScripts("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd");

let model = null;
let busy = false;

// モデルの読み込み（起動時に1回）
async function init() {
  model = await cocoSsd.load({ base: "mobilenet_v2" });
  postMessage({ type: "ready" });
}
init();

// メインから画像が届いたら検出する
onmessage = async (e) => {
  if (e.data.type !== "frame" || !model || busy) return;
  busy = true;
  try {
    // 送られてきた ImageBitmap をそのまま検出にかけられる
    const predictions = await model.detect(e.data.bitmap);
    postMessage({ type: "result", predictions });
  } catch (err) {
    postMessage({ type: "error", message: String(err) });
  } finally {
    // 受け取ったbitmapは使い終わったら解放（メモリ対策）
    if (e.data.bitmap.close) e.data.bitmap.close();
    busy = false;
  }
};
