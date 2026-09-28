import { modelIsDownloaded, preparePersianVoice, synthesizePersian, PERSIAN_VOICE_ID } from "./piper-engine.js";
import { wavBlobToMp3 } from "./mp3-encoder.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const MAX_CHARS = 3000;
const toneProfiles = {
  normal: { label: "عادی", speed: 1.00 },
  formal: { label: "رسمی", speed: 0.94 },
  news: { label: "خبری", speed: 1.07 },
  cheerful: { label: "شاد", speed: 1.08 },
  intimate: { label: "صمیمی", speed: 0.96 }
};
const state = {
  engine: localStorage.getItem("engine") === "online" ? "online" : "offline",
  tone: "normal",
  audioPath: null,
  audioUrl: null,
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
    if (response.ok) pronunciationMap = await response.json();
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
  window.__toast = setTimeout(() => element.classList.remove("show"), 3600);
}

function nativePlugin() {
  return window.Capacitor?.Plugins?.PersianVoice || null;
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
  const plugin = nativePlugin();
  const extension = blob.type === "audio/mpeg" ? "mp3" : "wav";
  if (!plugin) return { path: URL.createObjectURL(blob), name: `voice_${Date.now()}.${extension}` };
  const base64 = await blobToBase64(blob);
  return plugin.saveBase64Audio({ base64, mime: blob.type || "audio/mpeg", extension });
}

function setEngineStatus(text) {
  $("#modelStatus").textContent = text;
}

function updateOfflineProgress(progress) {
  if (progress.phase === "ready") {
    setEngineStatus("مدل آفلاین آماده");
    $("#prepareOfflineBtn").classList.add("hidden");
    return;
  }
  const loaded = Number(progress.loaded) || 0;
  const total = Number(progress.total) || 0;
  const name = progress.asset || "مدل فارسی";
  if (progress.cached) {
    setEngineStatus("در حال آماده‌سازی آفلاین");
  } else if (total > 0) {
    const percent = Math.min(100, Math.floor((loaded / total) * 100));
    setEngineStatus(`دریافت ${name} · ${toFaNumber(percent)}٪`);
  } else if (progress.phase === "model") {
    setEngineStatus("آماده‌سازی مدل فارسی…");
  }
}

async function onlineGenerate(text) {
  const base = gatewayUrl();
  if (!base) throw new Error("ابتدا آدرس سرور را در تنظیمات وارد کنید.");
  const response = await fetch(`${base}/v1/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId: PERSIAN_VOICE_ID, speed: 1 })
  });
  if (!response.ok) {
    let message = "تولید صدا ناموفق بود.";
    try { const body = await response.json(); message = body.error || body.detail || message; } catch (_) {}
    throw new Error(message);
  }
  return response.blob();
}

async function offlineGenerate(text) {
  return synthesizePersian(text, updateOfflineProgress);
}

function updateStats() {
  const text = $("#textInput").value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $("#charCount").textContent = toFaNumber(text.length);
  $("#wordCount").textContent = toFaNumber(words);
  $("#charCount").classList.toggle("over-limit", text.length > MAX_CHARS);
}

function fileName() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `AvayeIranAzad_${stamp}_${Date.now().toString().slice(-6)}.mp3`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function renderHistory() {
  const list = $("#historyList");
  const history = JSON.parse(localStorage.getItem("voice_history") || "[]");
  if (!history.length) {
    list.innerHTML = '<div class="history-empty">هنوز فایلی ساخته نشده است.</div>';
    return;
  }
  list.innerHTML = history.map((item, index) => {
    const when = new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(item.time || Date.now());
    return `<div class="history-item"><div class="history-info"><span class="history-text">${escapeHtml(item.text.slice(0, 88))}</span><span class="history-date">${when} · MP3 · ${escapeHtml(item.toneLabel || "عادی")}</span></div><button class="history-play" type="button" data-history-play="${index}">پخش</button></div>`;
  }).join("");
  $$('[data-history-play]').forEach((button) => {
    button.onclick = async () => {
      const item = history[Number(button.dataset.historyPlay)];
      if (!item?.path) return toast("فایل ذخیره‌شده پیدا نشد.");
      await playPath(item.path);
      $("#outputMeta").textContent = `امیر · ${item.toneLabel || "عادی"}`;
      $("#historyModal").classList.add("hidden");
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    };
  });
}

function playPath(path) {
  const url = path.startsWith("blob:") ? path : (window.Capacitor?.convertFileSrc ? window.Capacitor.convertFileSrc(path) : path);
  $("#audioPlayer").src = url;
  $("#audioPlayer").load();
  state.audioPath = path;
  state.audioUrl = url;
  $("#playerPanel").classList.remove("hidden");
  return Promise.resolve();
}

function setBusy(busy, label = "در حال ساخت فایل…") {
  $("#generateBtn").disabled = busy;
  $("#generateLabel").textContent = busy ? label : "تبدیل به گفتار";
  if (busy) $("#playerPanel").classList.add("hidden");
}

async function prepareOffline() {
  if (state.preparing) return;
  state.preparing = true;
  $("#prepareOfflineBtn").disabled = true;
  setEngineStatus("در حال دریافت مدل…");
  try {
    await preparePersianVoice(updateOfflineProgress);
    toast("مدل آفلاین آماده است.");
  } catch (error) {
    console.error(error);
    setEngineStatus("مدل دریافت نشد");
    toast(error.message || "دریافت مدل ناموفق بود.");
  } finally {
    state.preparing = false;
    $("#prepareOfflineBtn").disabled = false;
  }
}

async function checkOffline() {
  try {
    const exists = await modelIsDownloaded();
    $("#prepareOfflineBtn").classList.toggle("hidden", exists);
    $("#engineStatus").textContent = state.engine === "online" ? "آنلاین" : "آفلاین";
    if (state.engine === "offline") setEngineStatus(exists ? "مدل آفلاین آماده" : "مدل آفلاین دریافت نشده");
  } catch (error) {
    $("#prepareOfflineBtn").classList.remove("hidden");
    $("#engineStatus").textContent = state.engine === "online" ? "آنلاین" : "آفلاین";
    if (state.engine === "offline") setEngineStatus("WebView را به‌روز کنید");
  }
}

function updateEngineUI() {
  const online = state.engine === "online";
  $("#onlineToggle").checked = online;
  $("#engineStatus").textContent = online ? "آنلاین" : "آفلاین";
  if (online) {
    $("#modelStatus").textContent = "پردازش آنلاین";
    $("#prepareOfflineBtn").classList.add("hidden");
  }
  else checkOffline();
}

async function generate() {
  const raw = $("#textInput").value;
  if (!raw.trim()) return toast("متن را وارد کنید.");
  if (raw.length > MAX_CHARS) return toast("حداکثر ۳۰۰۰ نویسه مجاز است.");
  const text = normalizePersian(raw);
  const tone = toneProfiles[state.tone] || toneProfiles.normal;
  setBusy(true, state.engine === "online" ? "در حال دریافت صدا…" : "در حال ساخت صدای آفلاین…");
  try {
    const wav = state.engine === "online" ? await onlineGenerate(text) : await offlineGenerate(text);
    let mp3 = wav;
    if (!wav.type.includes("mpeg")) {
      $("#generateLabel").textContent = "در حال آماده‌سازی MP3…";
      mp3 = await wavBlobToMp3(wav, { speed: tone.speed, onProgress: (percent) => {
        if (percent < 100) $("#generateLabel").textContent = `ساخت MP3 · ${toFaNumber(percent)}٪`;
      }});
    }
    const saved = await saveBlobToAppCache(mp3);
    await playPath(saved.path);
    $("#outputMeta").textContent = `امیر · ${tone.label}${Math.abs(tone.speed - 1) > .001 ? ` · ریتم ${tone.speed > 1 ? "تندتر" : "آرام‌تر"}` : ""}`;
    $("#outputDuration").textContent = "";
    const history = JSON.parse(localStorage.getItem("voice_history") || "[]");
    history.unshift({ text: raw, path: saved.path, name: saved.name || fileName(), time: Date.now(), tone: state.tone, toneLabel: tone.label, engine: state.engine });
    localStorage.setItem("voice_history", JSON.stringify(history.slice(0, 30)));
    toast("فایل MP3 آمادهٔ پخش است.");
    setTimeout(() => $("#playerPanel").scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  } catch (error) {
    console.error(error);
    toast(error.message || "تبدیل صدا انجام نشد.");
  } finally {
    setBusy(false);
  }
}

async function saveAudio(directory) {
  if (!state.audioPath) return;
  const name = fileName();
  const plugin = nativePlugin();
  if (plugin && !state.audioPath.startsWith("blob:")) {
    try {
      await plugin.saveToDownloads({ path: state.audioPath, fileName: name, directory });
      toast(directory === "downloads" ? "فایل در پوشهٔ دانلود ذخیره شد." : "فایل در پوشهٔ موسیقی ذخیره شد.");
    } catch (error) { toast(error.message || "ذخیرهٔ فایل ناموفق بود."); }
    return;
  }
  try {
    const blob = state.audioPath.startsWith("blob:") ? await (await fetch(state.audioPath)).blob() : await (await fetch(state.audioUrl)).blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message || "دانلود فایل ناموفق بود."); }
}

async function testOnline() {
  const base = gatewayUrl();
  if (!base) return toast("آدرس سرور آنلاین را وارد کنید.");
  try {
    const response = await fetch(`${base}/health`);
    const result = await response.json();
    if (!response.ok || result.status !== "ok") throw new Error(result.error || "سرور آماده نیست.");
    toast("اتصال سرور موفق بود.");
  } catch (error) { toast(error.message || "اتصال برقرار نشد."); }
}

function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#menuBtn").setAttribute("aria-expanded", "false");
  $("#drawerScrim").classList.add("hidden");
}

function openDrawer() {
  $("#drawer").classList.add("open");
  $("#drawer").setAttribute("aria-hidden", "false");
  $("#menuBtn").setAttribute("aria-expanded", "true");
  $("#drawerScrim").classList.remove("hidden");
}

$("#textInput").addEventListener("input", updateStats);
$("#clearText").onclick = () => { $("#textInput").value = ""; updateStats(); $("#textInput").focus(); };
$("#generateBtn").onclick = generate;
$("#prepareOfflineBtn").onclick = prepareOffline;
$("#menuBtn").onclick = openDrawer;
$("#closeDrawer").onclick = closeDrawer;
$("#drawerScrim").onclick = closeDrawer;
$("#historyAction").onclick = () => { closeDrawer(); renderHistory(); $("#historyModal").classList.remove("hidden"); };
$("#settingsAction").onclick = () => {
  closeDrawer();
  $("#gatewayUrl").value = gatewayUrl();
  $("#onlineToggle").checked = state.engine === "online";
  $("#settingsModal").classList.remove("hidden");
};
$("#closeSettings").onclick = () => $("#settingsModal").classList.add("hidden");
$("#closeHistory").onclick = () => $("#historyModal").classList.add("hidden");
$("#settingsModal").onclick = (event) => { if (event.target === $("#settingsModal")) $("#settingsModal").classList.add("hidden"); };
$("#historyModal").onclick = (event) => { if (event.target === $("#historyModal")) $("#historyModal").classList.add("hidden"); };
$("#saveSettings").onclick = () => {
  const value = $("#gatewayUrl").value.trim().replace(/\/$/, "");
  if (value) {
    try { if (!["http:", "https:"].includes(new URL(value).protocol)) throw new Error(); }
    catch (_) { return toast("آدرس سرور معتبر نیست."); }
    localStorage.setItem("tts_gateway_url", value);
  } else localStorage.removeItem("tts_gateway_url");
  if ($("#onlineToggle").checked && !value) return toast("برای حالت آنلاین آدرس سرور لازم است.");
  state.engine = $("#onlineToggle").checked ? "online" : "offline";
  localStorage.setItem("engine", state.engine);
  $("#settingsModal").classList.add("hidden");
  updateEngineUI();
  toast("تنظیمات ذخیره شد.");
};
$("#testOnlineBtn").onclick = testOnline;
$("#clearHistory").onclick = () => {
  if (!JSON.parse(localStorage.getItem("voice_history") || "[]").length) return;
  localStorage.removeItem("voice_history");
  renderHistory();
  toast("تاریخچه پاک شد.");
};
$$('[data-tone]').forEach((button) => {
  button.onclick = () => {
    state.tone = button.dataset.tone;
    $$('[data-tone]').forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  };
});
$("#downloadBtn").onclick = () => saveAudio("downloads");
$("#saveBtn").onclick = () => saveAudio("music");
$("#audioPlayer").onloadedmetadata = () => {
  const seconds = Math.floor($("#audioPlayer").duration || 0);
  $("#outputDuration").textContent = seconds ? `${toFaNumber(Math.floor(seconds / 60))}:${toFaNumber(String(seconds % 60).padStart(2, "0"))}` : "";
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDrawer();
    $("#settingsModal").classList.add("hidden");
    $("#historyModal").classList.add("hidden");
  }
});

loadPronunciationMap();
updateStats();
updateEngineUI();
