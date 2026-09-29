import { HF_BASE, PATH_MAP, TtsSession, stored } from "@mintplex-labs/piper-tts-web";
import { PERSIAN_VOICE_ID, PERSIAN_WOMAN_VOICE_ID } from "./voice-models.js";

export { PERSIAN_VOICE_ID, PERSIAN_WOMAN_VOICE_ID };

export const PERSIAN_VOICES = {
  male: { id: PERSIAN_VOICE_ID, label: "امیر · مردانه" },
  female: { id: PERSIAN_WOMAN_VOICE_ID, label: "مانا · زنانه" }
};

// This relative route redirects to the model author's public Hugging Face repo.
PATH_MAP[PERSIAN_WOMAN_VOICE_ID] = "../../../../MahtaFetrat/Mana-Persian-Piper/resolve/main/fa_IR-mana-medium.onnx";

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
let sessionVoiceId;

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
  const response = await fetch(url);
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

function assertVoiceId(voiceId) {
  if (!Object.values(PERSIAN_VOICES).some((voice) => voice.id === voiceId)) {
    throw new Error("مدل صدای انتخاب‌شده پشتیبانی نمی‌شود.");
  }
}

async function getModelDirectory() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("piper", { create: true });
}

async function isModelFileComplete(directory, filename) {
  try {
    const file = await directory.getFileHandle(filename);
    const blob = await file.getFile();
    const minimumSize = filename.endsWith(".onnx") ? 20 * 1024 * 1024 : 128;
    return blob.size >= minimumSize;
  } catch (_) {
    return false;
  }
}

export async function modelIsDownloaded(voiceId = PERSIAN_VOICE_ID) {
  assertLocalStorageSupport();
  assertVoiceId(voiceId);
  try {
    if (!(await stored()).includes(voiceId)) return false;
    const directory = await getModelDirectory();
    return await isModelFileComplete(directory, `${voiceId}.onnx`) &&
      await isModelFileComplete(directory, `${voiceId}.onnx.json`);
  } catch (_) {
    return false;
  }
}

async function cacheModelFile(url, asset, onProgress) {
  const directory = await getModelDirectory();
  const filename = url.split("/").at(-1);
  if (await isModelFileComplete(directory, filename)) {
    const cached = await (await directory.getFileHandle(filename)).getFile();
    onProgress?.({ phase: "model-download", url, asset, loaded: cached.size, total: cached.size, cached: true });
    return;
  }

  let handle;
  let writable;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`دریافت ${asset} ناموفق بود (${response.status}).`);
    const total = Number(response.headers.get("content-length")) || 0;
    handle = await directory.getFileHandle(filename, { create: true });
    writable = await handle.createWritable();
    let loaded = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        loaded += value.byteLength;
        onProgress?.({ phase: "model-download", url, asset, loaded, total });
      }
    } else {
      const blob = await response.blob();
      await writable.write(blob);
      loaded = blob.size;
      onProgress?.({ phase: "model-download", url, asset, loaded, total: total || loaded });
    }
    await writable.close();
    const saved = await handle.getFile();
    const minimumSize = filename.endsWith(".onnx") ? 20 * 1024 * 1024 : 128;
    if (saved.size < minimumSize) throw new Error(`فایل ${asset} ناقص دریافت شده است.`);
    onProgress?.({ phase: "model-download", url, asset, loaded: saved.size, total: total || saved.size });
  } catch (error) {
    try { await writable?.abort?.(); } catch (_) {}
    try { await directory.removeEntry(filename); } catch (_) {}
    throw error;
  }
}

export async function prefetchPersianVoice(voiceId, onProgress) {
  assertLocalStorageSupport();
  assertVoiceId(voiceId);
  try { await navigator.storage.persist?.(); } catch (_) {}
  if (await modelIsDownloaded(voiceId)) {
    onProgress?.({ phase: "model-download", asset: PERSIAN_VOICES[voiceId === PERSIAN_VOICE_ID ? "male" : "female"].label, loaded: 1, total: 1, cached: true });
    return;
  }
  const path = PATH_MAP[voiceId];
  if (!path) throw new Error("نشانی مدل صدا در دسترس نیست.");
  const base = `${HF_BASE}/${path}`;
  const label = PERSIAN_VOICES[voiceId === PERSIAN_VOICE_ID ? "male" : "female"].label;
  await cacheModelFile(base, `مدل ${label}`, onProgress);
  await cacheModelFile(`${base}.json`, `تنظیمات ${label}`, onProgress);
  if (!(await modelIsDownloaded(voiceId))) throw new Error(`ذخیرهٔ مدل ${label} تأیید نشد.`);
}

export async function preparePersianVoice(voiceId = PERSIAN_VOICE_ID, onProgress) {
  assertLocalStorageSupport();
  assertVoiceId(voiceId);
  if (sessionPromise && sessionVoiceId === voiceId) return sessionPromise;
  if (sessionVoiceId !== voiceId) {
    sessionPromise = null;
    try { TtsSession._instance = null; } catch (_) {}
  }
  sessionVoiceId = voiceId;
  const voice = Object.values(PERSIAN_VOICES).find((item) => item.id === voiceId);
  sessionPromise = (async () => {
    try {
      try { await navigator.storage.persist?.(); } catch (_) {}
      const [ortWasm, piperWasm, piperData] = await Promise.all(
        RUNTIME_ASSETS.map((asset) => loadAsset(asset, onProgress))
      );
      onProgress?.({ phase: "model", loaded: 0, total: 0, asset: `مدل ${voice.label}` });
      const wasmPaths = {
        onnxWasm: {
          "ort-wasm-simd.wasm": ortWasm,
          "ort-wasm.wasm": ortWasm
        },
        piperWasm,
        piperData
      };
      const session = await TtsSession.create({
        voiceId,
        wasmPaths,
        progress: (progress) => onProgress?.({ ...progress, phase: "model", asset: `مدل ${voice.label}` })
      });
      onProgress?.({ phase: "ready", loaded: 1, total: 1, asset: voice.label });
      return session;
    } catch (error) {
      if (sessionVoiceId === voiceId) {
        sessionPromise = null;
        sessionVoiceId = null;
      }
      try { TtsSession._instance = null; } catch (_) {}
      throw error;
    }
  })();
  return sessionPromise;
}
