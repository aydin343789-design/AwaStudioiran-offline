import { modelIsDownloaded, preparePersianVoice, synthesizePersian, PERSIAN_VOICE_ID } from "./piper-engine.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {
  engine: localStorage.getItem("engine") || "offline",
  audioPath: null,
  audioUrl: null,
  voices: [],
  preparing: false
};
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
let pronunciationMap = {};

function gatewayUrl() {
  return (localStorage.getItem("tts_gateway_url") || "").trim().replace(/\/$/, "");
}

async function loadPronunciationMap() {
  try {
    const response = await fetch("data/pronunciation-fa.json");
    pronunciationMap = await response.json();
  } catch (_) {}
}

function normalizePersian(text) {
  let out = text.replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/ۀ/g, "هٔ")
    .replace(/\u200c+/g, "\u200c").replace(/[ـ]+/g, "")
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[ \t]+/g, " ").replace(/ *([،؛؟!]) */g, "$1 ")
    .replace(/\.{3,}/g, "…").trim();
  for (const [word, spoken] of Object.entries(pronunciationMap)) out = out.replaceAll(word, spoken);
  return out;
}

function toFaNumber(value) {
  return String(value).replace(/\d/g, (digit) => persianDigits[digit]);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => element.classList.remove("show"), 4000);
}

function setBusy(busy, label = "در حال تولید...") {
  $("#generateBtn").disabled = busy;
  $("#generateLabel").textContent = busy ? label : "تولید صدای فارسی";
  $("#engineStatus").textContent = busy ? "در حال پردازش صدا..." : "آماده تولید صدا";
}

function nativePlugin() {
  const plugin = window.Capacitor?.Plugins?.PersianVoice;
  if (!plugin) throw new Error("پلاگین Android در دسترس نیست. APK را از workflow جدید GitHub بسازید.");
  return plugin;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function saveBlobToAppCache(blob) {
  const plugin = window.Capacitor?.Plugins?.PersianVoice;
  if (!plugin) {
    const path = URL.createObjectURL(blob);
    return { path, name: `voice_${Date.now()}.wav` };
  }
  const base64 = await blobToBase64(blob);
  return plugin.saveBase64Audio({ base64, mime: "audio/wav", extension: "wav" });
}

function updateOfflineProgress(progress) {
  const status = $("#offlineStatus");
  if (!status) return;
  if (progress.phase === "ready") {
    status.textContent = "مدل آماده است؛ پس از این مرحله بدون اینترنت کار می‌کند.";
    return;
  }
  if (progress.cached) {
    status.textContent = `${progress.asset}: از حافظهٔ گوشی بارگذاری شد.`;
    return;
  }
  const loaded = Number(progress.loaded) || 0;
  const total = Number(progress.total) || 0;
  const mb = (loaded / (1024 * 1024)).toFixed(1).replace(".", "٫");
  if (total > 0) {
    const percent = Math.min(100, Math.floor((loaded / total) * 100));
    status.textContent = `دریافت ${progress.asset || "فایل"}: ${toFaNumber(percent)}٪ · ${toFaNumber(mb)} مگابایت`;
  } else {
    status.textContent = `آماده‌سازی ${progress.asset || "مدل"}...`;
  }
}

async function onlineGenerate(text) {
  const base = gatewayUrl();
  if (!base) throw new Error("آدرس Cloudflare Worker را در تنظیمات وارد کنید.");
  const response = await fetch(`${base}/v1/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId: PERSIAN_VOICE_ID, speed: Number($("#speed").value) })
  });
  if (!response.ok) {
    let message = "تولید آنلاین ناموفق بود.";
    try {
      const body = await response.json();
      message = body.error || body.detail || message;
    } catch (_) {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const saved = await saveBlobToAppCache(blob);
  return { ...saved, mime: "audio/wav" };
}

async function offlineGenerate(text) {
  const blob = await synthesizePersian(text, updateOfflineProgress);
  const saved = await saveBlobToAppCache(blob);
  return { ...saved, mime: "audio/wav" };
}

async function playPath(path) {
  const url = path.startsWith("blob:") ? path : window.Capacitor.convertFileSrc(path);
  $("#audioPlayer").src = url;
  $("#audioPlayer").load();
  state.audioPath = path;
  state.audioUrl = url;
  $("#playerPanel").classList.remove("hidden");
  drawWave();
  $("#audioPlayer").play().catch(() => {});
}

function drawWave() {
  const canvas = $("#waveCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth || 600;
  const height = 72;
  const scale = devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);
  const middle = height / 2;
  for (let i = 0; i < width; i += 5) {
    const amplitude = 8 + Math.abs(Math.sin(i * 0.09)) * 24 + Math.abs(Math.sin(i * 0.023)) * 10;
    ctx.fillStyle = i % 10 === 0 ? "#8c76ff" : "#4fbdab";
    ctx.fillRect(i, middle - amplitude / 2, 3, amplitude);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function addHistory(item) {
  const history = JSON.parse(localStorage.getItem("voice_history") || "[]");
  history.unshift(item);
  localStorage.setItem("voice_history", JSON.stringify(history.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const list = $("#historyList");
  const history = JSON.parse(localStorage.getItem("voice_history") || "[]");
  if (!history.length) {
    list.innerHTML = '<div class="history-item"><span>هنوز خروجی‌ای ساخته نشده است.</span></div>';
    return;
  }
  list.innerHTML = history.map((item, index) => `<div class="history-item"><span>${escapeHtml(item.text.slice(0, 70))}</span><button data-history="${index}">باز کردن</button></div>`).join("");
  $$('[data-history]').forEach((button) => button.onclick = async () => {
    const item = history[Number(button.dataset.history)];
    if (item.path) await playPath(item.path);
  });
}

function updateStats() {
  const text = $("#textInput").value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $("#charCount").textContent = toFaNumber(text.length);
  $("#wordCount").textContent = toFaNumber(words);
  $("#timeEstimate").textContent = toFaNumber(Math.max(0, Math.round(words / 2.4)));
}

async function prepareOffline() {
  if (state.preparing) return;
  state.preparing = true;
  $("#prepareOfflineBtn").disabled = true;
  $("#offlineStatus").textContent = "در حال آماده‌سازی runtime و مدل؛ بار اول اینترنت لازم است...";
  try {
    await preparePersianVoice(updateOfflineProgress);
    toast("مدل فارسی آماده است و از این پس آفلاین کار می‌کند.");
  } catch (error) {
    console.error(error);
    $("#offlineStatus").textContent = error.message || "آماده‌سازی مدل ناموفق بود.";
    toast(error.message || "دریافت مدل انجام نشد.");
  } finally {
    state.preparing = false;
    $("#prepareOfflineBtn").disabled = false;
  }
}

async function checkOffline() {
  try {
    const exists = await modelIsDownloaded();
    $("#offlineStatus").textContent = exists
      ? "مدل صدای فارسی روی گوشی موجود است؛ آمادهٔ استفادهٔ آفلاین."
      : "هنوز دریافت نشده؛ بار اول حدود ۹۰ مگابایت اینترنت لازم است، سپس آفلاین می‌شود.";
  } catch (error) {
    $("#offlineStatus").textContent = error.message || "WebView با ذخیره‌سازی مدل سازگار نیست.";
  }
}

async function generate() {
  let text = $("#textInput").value.trim();
  if (!text) return toast("ابتدا متن را وارد کنید.");
  text = normalizePersian(text);
  setBusy(true, state.engine === "online" ? "در حال ساخت صدا روی سرور..." : "در حال آماده‌سازی صدای محلی...");
  try {
    const result = state.engine === "online" ? await onlineGenerate(text) : await offlineGenerate(text);
    await playPath(result.path);
    $("#audioType").textContent = "WAV";
    addHistory({ text: $("#textInput").value, path: result.path, name: result.name, time: Date.now(), engine: state.engine });
    toast("صدا با موفقیت ساخته شد.");
  } catch (error) {
    console.error(error);
    toast(error.message || "تولید صدا انجام نشد.");
  } finally {
    setBusy(false);
  }
}

async function testOnline() {
  const base = gatewayUrl();
  if (!base) return toast("آدرس Cloudflare Worker را وارد کنید.");
  try {
    const response = await fetch(`${base}/health`);
    const result = await response.json();
    if (!response.ok || result.status !== "ok") throw new Error(result.error || "API آنلاین آماده نیست.");
    toast("اتصال به API متن‌باز Piper موفق بود.");
  } catch (error) {
    toast(error.message || "اتصال آنلاین ناموفق بود.");
  }
}

function applyEngine(engine) {
  state.engine = engine;
  localStorage.setItem("engine", engine);
  $$(".seg").forEach((button) => button.classList.toggle("active", button.dataset.engine === engine));
  $("#onlineControls").classList.toggle("hidden", engine !== "online");
  $("#offlineControls").classList.toggle("hidden", engine !== "offline");
  if (engine === "offline") checkOffline();
}

$("#textInput").oninput = updateStats;
$("#clearText").onclick = () => { $("#textInput").value = ""; updateStats(); };
$("#generateBtn").onclick = generate;
$("#prepareOfflineBtn").onclick = prepareOffline;
$("#themeBtn").onclick = () => {
  document.body.classList.toggle("light");
  localStorage.setItem("light", document.body.classList.contains("light"));
};
$("#newBtn").onclick = () => {
  $("#textInput").value = "";
  $("#playerPanel").classList.add("hidden");
  updateStats();
  $("#textInput").focus();
};
$("#clearHistory").onclick = () => { localStorage.removeItem("voice_history"); renderHistory(); toast("تاریخچه پاک شد."); };
$("#settingsBtn").onclick = () => { $("#gatewayUrl").value = gatewayUrl(); $("#settingsModal").classList.remove("hidden"); };
$("#closeSettings").onclick = () => $("#settingsModal").classList.add("hidden");
$("#saveSettings").onclick = () => {
  const value = $("#gatewayUrl").value.trim().replace(/\/$/, "");
  if (value) localStorage.setItem("tts_gateway_url", value);
  else localStorage.removeItem("tts_gateway_url");
  $("#settingsModal").classList.add("hidden");
  toast("تنظیمات ذخیره شد.");
};
$("#testOnlineBtn").onclick = testOnline;
$("#checkOfflineBtn").onclick = checkOffline;
$$(".seg").forEach((button) => button.onclick = () => applyEngine(button.dataset.engine));
$("#speed").oninput = () => $("#speedVal").textContent = `${$("#speed").value.replace(".", "٫")}×`;
$("#saveBtn").onclick = async () => {
  if (!state.audioPath) return;
  if (state.audioPath.startsWith("blob:")) {
    const link = document.createElement("a");
    link.href = state.audioPath;
    link.download = `AvayeIranAzad_${Date.now()}.wav`;
    link.click();
    return;
  }
  try {
    const plugin = nativePlugin();
    await plugin.saveToDownloads({ path: state.audioPath, fileName: `AvayeIranAzad_${Date.now()}.wav` });
    toast("فایل در پوشه Music/Avaye Iran Azad ذخیره شد.");
  } catch (error) { toast(error.message || "ذخیره انجام نشد."); }
};
$("#shareBtn").onclick = async () => {
  if (!state.audioPath) return;
  if (state.audioPath.startsWith("blob:")) {
    try {
      const blob = await (await fetch(state.audioPath)).blob();
      const file = new File([blob], `AvayeIranAzad_${Date.now()}.wav`, { type: "audio/wav" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else toast("اشتراک‌گذاری فایل در این مرورگر پشتیبانی نمی‌شود.");
    } catch (error) { toast(error.message || "اشتراک‌گذاری انجام نشد."); }
    return;
  }
  try { await nativePlugin().shareAudio({ path: state.audioPath }); }
  catch (error) { toast(error.message || "اشتراک‌گذاری انجام نشد."); }
};

if (localStorage.getItem("light") === "true") document.body.classList.add("light");
loadPronunciationMap();
updateStats();
renderHistory();
applyEngine(state.engine);
