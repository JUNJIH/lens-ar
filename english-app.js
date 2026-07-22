// ─────────────────────────────────────────────────────────
// english-app.js — 部屋が単語帳になる
// ─────────────────────────────────────────────────────────
// 流れ：
//   物体を認識 → 英単語を出す → 声に出す → 正しければ消える → 正解+1
//
// モード：
//   LEARN（覚える）… 単語を表示する。読み上げ練習
//   QUIZ （試す）  … 単語を隠して「？」にする。思い出して答える
//
// 物体認識はdetect-worker.jsを再利用（Worker側は変更なし）。
// 音声認識はWeb Speech API（ブラウザ標準・追加ライブラリ不要）。
// ─────────────────────────────────────────────────────────

// ── 日本語訳（ヒント表示用）──
const JP = {
  refrigerator: "冷蔵庫", microwave: "電子レンジ", oven: "オーブン", sink: "流し",
  book: "本", bottle: "びん", cup: "カップ", bowl: "ボウル", spoon: "スプーン",
  fork: "フォーク", knife: "ナイフ", chair: "椅子", couch: "ソファ",
  "dining table": "食卓", bed: "ベッド", tv: "テレビ", laptop: "ノートPC",
  "cell phone": "携帯電話", keyboard: "キーボード", mouse: "マウス",
  clock: "時計", vase: "花瓶", scissors: "はさみ", "potted plant": "観葉植物",
  "teddy bear": "ぬいぐるみ", backpack: "リュック", umbrella: "傘",
  handbag: "ハンドバッグ", tie: "ネクタイ", suitcase: "スーツケース",
  banana: "バナナ", apple: "りんご", orange: "オレンジ", carrot: "にんじん",
  "toilet": "トイレ", "hair drier": "ドライヤー", toothbrush: "歯ブラシ",
  "remote": "リモコン", "wine glass": "ワイングラス", "toaster": "トースター",
  person: "人", cat: "猫", dog: "犬",
};

const MIN_SCORE = 0.5;
const KEEP_MS = 1200;
const SMOOTH = 0.18;
const DETECT_INTERVAL = 200;
const DETECT_WIDTH = 480;

let scaleRatio = 1;
let scratch = null;

const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const heardEl = document.getElementById("heard");
const scoreEl = document.getElementById("score");
const toastEl = document.getElementById("toast");
const micBtn = document.getElementById("micBtn");

const tracked = {};
let worker = null, workerReady = false, sending = false;

let mode = "learn";     // "learn" | "quiz"
let score = 0;
const cleared = new Set(); // 言えた単語（この場から消す）

// ─────────────────────────────────────────────
// 物体認識（Worker）
// ─────────────────────────────────────────────
function startWorker() {
  worker = new Worker("detect-worker.js");
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "ready") {
      workerReady = true;
      heardEl.textContent = "マイクを押して、見えているものを英語で言ってください";
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
    const box = [
      p.bbox[0] / scaleRatio, p.bbox[1] / scaleRatio,
      p.bbox[2] / scaleRatio, p.bbox[3] / scaleRatio,
    ];
    const prev = tracked[p.class];
    tracked[p.class] = { bbox: box, score: p.score, lastSeen: now, shown: prev ? prev.shown : box };
  });
  Object.keys(tracked).forEach((label) => {
    if (now - tracked[label].lastSeen > KEEP_MS) delete tracked[label];
  });
}

// ─────────────────────────────────────────────
// 描画
// ─────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  Object.keys(tracked).forEach((label) => {
    if (cleared.has(label)) return; // 言えたものは表示しない

    const t = tracked[label];
    t.shown = lerpBox(t.shown, t.bbox, SMOOTH);
    const [x, y, w, h] = t.shown;

    // 枠
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // 表示するテキスト（モードで変わる）
    const word = mode === "learn" ? label : "? ? ?";
    const hint = JP[label] || "";

    ctx.font = "bold 44px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
    const tw = ctx.measureText(word).width;
    const boxW = Math.max(tw + 30, 160);

    ctx.fillStyle = "rgba(13,15,18,0.9)";
    ctx.fillRect(x, y - 62, boxW, 62);
    ctx.fillStyle = mode === "learn" ? "#7dd3fc" : "#e0a020";
    ctx.fillText(word, x + 15, y - 18);

    // QUIZモードでは日本語をヒントとして下に出す
    if (mode === "quiz" && hint) {
      ctx.font = "30px 'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif";
      const hw = ctx.measureText(hint).width;
      ctx.fillStyle = "rgba(13,15,18,0.85)";
      ctx.fillRect(x, y + h + 6, hw + 26, 46);
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(hint, x + 13, y + h + 38);
    }
  });
}

let lastT = performance.now();
function renderLoop() {
  draw();
  lastT = performance.now();
  requestAnimationFrame(renderLoop);
}

// ─────────────────────────────────────────────
// 音声認識（Web Speech API）
// ─────────────────────────────────────────────
// ブラウザ標準の仕組み。追加ライブラリ不要。
// 英語モードで聞き取り、今見えている単語と一致したら正解にする。
let recognition = null;
let listening = false;

function setupSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    heardEl.textContent = "このブラウザは音声認識に対応していません（Chrome推奨）";
    micBtn.disabled = true;
    return;
  }

  recognition = new SR();
  recognition.lang = "en-US";      // 英語で聞き取る
  recognition.continuous = true;   // 話し続けても止めない
  recognition.interimResults = true; // 途中経過も受け取る（反応を速く）

  recognition.onresult = (e) => {
    let text = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
    }
    text = text.toLowerCase().trim();
    heardEl.innerHTML = "聞き取り：<b>" + text + "</b>";
    checkAnswer(text);
  };

  recognition.onerror = (e) => {
    console.error("音声認識エラー:", e.error);
    if (e.error === "not-allowed") {
      heardEl.textContent = "マイクの使用が許可されていません";
      stopListening();
    }
  };

  // 自動で止まったら、リスニング中なら再開する
  recognition.onend = () => {
    if (listening) {
      try { recognition.start(); } catch (err) {}
    }
  };
}

function startListening() {
  if (!recognition) return;
  listening = true;
  micBtn.classList.add("on");
  heardEl.textContent = "聞いています…";
  try { recognition.start(); } catch (e) {}
}

function stopListening() {
  listening = false;
  micBtn.classList.remove("on");
  if (recognition) recognition.stop();
  heardEl.textContent = "マイクを押して、見えているものを英語で言ってください";
}

// ── 聞き取った言葉が、今見えている単語と一致するか ──
function checkAnswer(text) {
  Object.keys(tracked).forEach((label) => {
    if (cleared.has(label)) return;
    // ラベルは "cell phone" のように複数語のこともある
    if (text.includes(label)) {
      correct(label);
    }
  });
}

function correct(label) {
  cleared.add(label);
  score++;
  scoreEl.textContent = "正解 " + score;
  showToast(label + " ✓");

  // 一定時間後にまた出題できるようにする（同じ部屋で繰り返し練習できる）
  setTimeout(() => cleared.delete(label), 20000);
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1200);
}

// ─────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────
function setupUI() {
  const learnBtn = document.getElementById("learnBtn");
  const quizBtn = document.getElementById("quizBtn");

  learnBtn.onclick = () => {
    mode = "learn";
    learnBtn.classList.add("active");
    quizBtn.classList.remove("active");
  };
  quizBtn.onclick = () => {
    mode = "quiz";
    quizBtn.classList.add("active");
    learnBtn.classList.remove("active");
  };

  micBtn.onclick = () => (listening ? stopListening() : startListening());
}

// ─────────────────────────────────────────────
(async function main() {
  try {
    setupUI();
    setupSpeech();
    heardEl.textContent = "カメラを起動しています…";
    await startCamera();
    heardEl.textContent = "検出エンジンを準備しています…";
    startWorker();
    renderLoop();
    sendFrame();
  } catch (e) {
    heardEl.textContent = "エラー: " + e.message;
    console.error(e);
  }
})();
