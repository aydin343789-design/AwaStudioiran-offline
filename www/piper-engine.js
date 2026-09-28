import { TtsSession, stored } from "@mintplex-labs/piper-tts-web";

export const PERSIAN_VOICE_ID = "fa_IR-amir-medium";
const RUNTIME_ASSETS = [
  {
    key: "ort-wasm-simd.wasm",
    label: "موتور ONNX WebAssembly",
    urls: [
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm",
      "https://unpkg.com/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm"
    ],
    type: "application/wasm"
  },
  {
    key: "piper_phonemize.wasm",
    label: "فایل اجرای Piper",
    urls: [
      "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm",
      "https://unpkg.com/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm"
    ],
    type: "application/wasm"
  },
  {
    key: "piper_phonemize.data",
    label: "دادهٔ تلفظ فارسی",
    urls: [
      "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data",
      "https://unpkg.com/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data"
    ],
    type: "application/octet-stream"
  }
];

const DB_NAME = "avaye-piper-runtime-v1";
const DB_STORE = "assets";
let dbPromise;
let objectUrls = {};
let sessionPromise;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("ذخیره‌سازی محلی در WebView پشتیبانی نمی‌شود."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("بازکردن حافظهٔ محلی ناموفق بود."));
  });
  return dbPromise;
}

async function cacheGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("خواندن cache ناموفق بود."));
  });
}

async function cachePut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("ذخیرهٔ فایل runtime ناموفق بود."));
  });
}

async function fetchBlobWithProgress(url, onProgress) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`دریافت فایل runtime ناموفق بود (${response.status}).`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body?.getReader) {
    const blob = await response.blob();
    onProgress?.({ loaded: blob.size, total: total || blob.size });
    return blob;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total });
  }
  return new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
}

async function loadAsset(asset, onProgress) {
  if (objectUrls[asset.key]) return objectUrls[asset.key];
  let blob = await cacheGet(asset.key).catch(() => null);
  if (!blob) {
    let lastError;
    for (const url of asset.urls) {
      try {
        blob = await fetchBlobWithProgress(url, (p) => onProgress?.({ ...p, phase: "runtime", asset: asset.label }));
        await cachePut(asset.key, blob);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!blob) throw new Error(`دانلود ${asset.label} ممکن نشد. اتصال اینترنت را بررسی کنید. ${lastError?.message || ""}`);
  } else {
    onProgress?.({ phase: "runtime", asset: asset.label, loaded: blob.size, total: blob.size, cached: true });
  }
  objectUrls[asset.key] = URL.createObjectURL(new Blob([blob], { type: asset.type }));
  return objectUrls[asset.key];
}

function assertLocalStorageSupport() {
  if (!navigator.storage?.getDirectory) {
    throw new Error("نسخهٔ WebView گوشی از فضای محلی لازم برای ذخیرهٔ مدل پشتیبانی نمی‌کند. Android System WebView یا Chrome را به‌روز کنید.");
  }
  if (!globalThis.WebAssembly || !WebAssembly.instantiate) {
    throw new Error("WebAssembly در WebView این گوشی در دسترس نیست.");
  }
}

export async function modelIsDownloaded() {
  assertLocalStorageSupport();
  try {
    return (await stored()).includes(PERSIAN_VOICE_ID);
  } catch (_) {
    return false;
  }
}

export async function preparePersianVoice(onProgress) {
  assertLocalStorageSupport();
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    try { await navigator.storage.persist?.(); } catch (_) {}
    const [ortWasm, piperWasm, piperData] = await Promise.all(
      RUNTIME_ASSETS.map((asset) => loadAsset(asset, onProgress))
    );
    onProgress?.({ phase: "model", loaded: 0, total: 0, asset: "مدل صدای فارسی (حدود ۶۴ مگابایت)" });
    const wasmPaths = {
      // Modern Android WebView supports WebAssembly SIMD. Keep the generic key mapped as well
      // for runtimes that select the non-SIMD binary name.
      onnxWasm: {
        "ort-wasm-simd.wasm": ortWasm,
        "ort-wasm.wasm": ortWasm
      },
      piperWasm,
      piperData
    };
    const session = await TtsSession.create({
      voiceId: PERSIAN_VOICE_ID,
      wasmPaths,
      progress: (progress) => onProgress?.({ ...progress, phase: "model", asset: "مدل صدای فارسی" })
    });
    onProgress?.({ phase: "ready", loaded: 1, total: 1 });
    return session;
  })().catch((error) => {
    sessionPromise = null;
    try { TtsSession._instance = null; } catch (_) {}
    throw error;
  });
  return sessionPromise;
}

export async function synthesizePersian(text, onProgress) {
  const session = await preparePersianVoice(onProgress);
  return session.predict(text);
}
