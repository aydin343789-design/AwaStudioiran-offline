import { PERSIAN_VOICE_ID, PERSIAN_WOMAN_VOICE_ID } from "./voice-models.js";
import { wavBlobToMp3 } from "./mp3-encoder.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const MAX_CHARS = 3000;
const toneProfiles = {
  normal: { label: "عادی", speed: 1.00, pitch: 0, pause: 1 },
  formal: { label: "رسمی", speed: 0.90, pitch: -0.5, pause: 1.3 },
  news: { label: "خبری", speed: 1.05, pitch: -0.25, pause: 0.8 },
  cheerful: { label: "شاد", speed: 1.12, pitch: 0.7, pause: 0.7 },
  intimate: { label: "صمیمی", speed: 0.88, pitch: -0.75, pause: 1.45 }
};
const voiceProfiles = {
  male: { id: PERSIAN_VOICE_ID, label: "امیر · مردانه" },
  female: { id: PERSIAN_WOMAN_VOICE_ID, label: "مانا · زنانه" },
  child: { id: PERSIAN_WOMAN_VOICE_ID, label: "کودک‌نما · آزمایشی" }
};
if (localStorage.getItem("audio_settings_version") !== "2") {
  localStorage.setItem("speech_speed", "0.82");
  localStorage.setItem("speech_pitch", "0");
  localStorage.setItem("audio_settings_version", "2");
}
const state = {
  engine: localStorage.getItem("engine") === "online" ? "online" : "offline",
  voice: voiceProfiles[localStorage.getItem("tts_voice")] ? localStorage.getItem("tts_voice") : "male",
  tone: toneProfiles[localStorage.getItem("tts_tone")] ? localStorage.getItem("tts_tone") : "normal",
  speed: Math.min(1.4, Math.max(0.6, Number(localStorage.getItem("speech_speed")) || 0.82)),
  pitch: Math.min(4, Math.max(-4, Number(localStorage.getItem("speech_pitch")) || 0)),
  audioPath: null,
  audioUrl: null,
  preparing: false,
  preloading: false
};
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
let pronunciationMap = {};
let ttsWorker = null;
let workerSequence = 0;
let preloadPromise = null;
const workerTasks = new Map();
const readyVoiceIds = new Set();

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

function updateToneUI() {
  $$('[data-tone]').forEach((button) => {
    const active = button.dataset.tone === state.tone;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setTone(key) {
  if (!toneProfiles[key]) return;
  state.tone = key;
  localStorage.setItem("tts_tone", key);
  updateToneUI();
}

function updateSpeedUI() {
  const slider = $("#speechSpeedRange");
  if (slider) slider.value = String(state.speed);
  const value = $("#speechSpeedValue");
  if (value) value.textContent = `${toFaNumber(state.speed.toFixed(2))}×`;
}

function updatePitchUI() {
  const slider = $("#speechPitchRange");
  if (slider) slider.value = String(state.pitch);
  const value = $("#speechPitchValue");
  if (value) value.textContent = `${state.pitch > 0 ? "+" : ""}${toFaNumber(state.pitch.toFixed(1))}`;
}

function toast(message, duration = 1800) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => element.classList.remove("show"), duration);
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

function ensureTtsWorker() {
  if (ttsWorker) return ttsWorker;
  ttsWorker = new Worker(new URL("./tts-worker.js", import.meta.url), { type: "module" });
  ttsWorker.onmessage = ({ data }) => {
    const task = workerTasks.get(data.id);
    if (!task) return;
    if (data.type === "progress") {
      task.onProgress?.(data.progress || {});
      return;
    }
    if (data.type === "voice-ready") {
      readyVoiceIds.add(data.voiceId);
      task.onProgress?.({ task: "preload", phase: "voice-ready", voiceId: data.voiceId, label: data.voiceLabel });
      checkOffline();
      return;
    }
    if (data.type === "voice-error") {
      task.onProgress?.({ task: "preload", phase: "error", voiceId: data.voiceId, label: data.message });
      return;
    }
    workerTasks.delete(data.id);
    if (data.type === "result") task.resolve(data.result);
    else if (data.type === "error") task.reject(new Error(data.message || "پردازش گفتار ناموفق بود."));
  };
  ttsWorker.onerror = (event) => {
    const error = new Error(event.message || "موتور آفلاین اجرا نشد.");
    workerTasks.forEach((task) => task.reject(error));
    workerTasks.clear();
    ttsWorker?.terminate();
    ttsWorker = null;
  };
  return ttsWorker;
}

function requestTtsWorker(type, payload, onProgress) {
  const worker = ensureTtsWorker();
  const id = ++workerSequence;
  return new Promise((resolve, reject) => {
    workerTasks.set(id, { resolve, reject, onProgress });
    try { worker.postMessage({ id, type, ...payload }); }
    catch (error) { workerTasks.delete(id); reject(error); }
  });
}

function selectedVoice() {
  return voiceProfiles[state.voice] || voiceProfiles.male;
}

function updateVoiceUI() {
  $$('[data-voice]').forEach((button) => {
    const active = button.dataset.voice === state.voice;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function selectVoice(key) {
  if (!voiceProfiles[key]) return;
  state.voice = key;
  localStorage.setItem("tts_voice", key);
  updateVoiceUI();
  if (state.engine === "offline") checkOffline();
}

function updateOfflineProgress(progress) {
  if (progress.task === "generate") {
    let percent = Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : 3;
    let label = progress.label || progress.asset || "در حال ساخت گفتار…";
    const loaded = Number(progress.loaded) || 0;
    const total = Number(progress.total) || 0;
    if (!Number.isFinite(Number(progress.percent)) && total > 0) {
      percent = 2 + Math.min(6, Math.floor((loaded / total) * 6));
      label = `${progress.asset || "آماده‌سازی موتور"} · ${toFaNumber(Math.floor((loaded / total) * 100))}٪`;
    }
    showGenerationProgress(percent, label);
    return;
  }
  if (progress.task === "preload" || progress.task === "prepare") {
    const panel = $("#offlineProgressPanel");
    const bar = $("#offlineProgressBar");
    panel?.classList.remove("hidden");
    if (progress.phase === "voice-ready") {
      const percent = Math.round((readyVoiceIds.size / 2) * 100);
      if (bar) bar.value = percent;
      $("#offlineProgressLabel").textContent = `مدل ${progress.label || "صدا"} آماده شد`;
      return;
    }
    if (progress.phase === "error") {
      setEngineStatus("دریافت مدل ناموفق بود");
      $("#offlineProgressLabel").textContent = progress.label || "دریافت مدل ناموفق بود";
      return;
    }
    const loaded = Number(progress.loaded) || 0;
    const total = Number(progress.total) || 0;
    const name = progress.asset || "فایل آفلاین";
    if (total > 0 && bar) {
      const percent = Math.min(100, Math.floor((loaded / total) * 100));
      bar.value = percent;
      $("#offlineProgressLabel").textContent = progress.cached
        ? `${name} · آماده`
        : `${name} · ${toFaNumber(percent)}٪`;
      setEngineStatus(progress.cached ? "آماده‌سازی آفلاین" : `دریافت ${name} · ${toFaNumber(percent)}٪`);
    } else {
      if (bar) bar.removeAttribute("value");
      $("#offlineProgressLabel").textContent = name;
      setEngineStatus(`آماده‌سازی ${name}…`);
    }
    return;
  }
  if (progress.phase === "ready") {
    readyVoiceIds.add(progress.voiceId || selectedVoice().id);
    setEngineStatus(`${selectedVoice().label} آماده`);
    $("#prepareOfflineBtn").classList.add("hidden");
  }
}

async function onlineGenerate(text) {
  if (state.voice !== "male") throw new Error("مدل زنانه فعلاً فقط در حالت آفلاین در دسترس است.");
  const base = gatewayUrl();
  if (!base) throw new Error("ابتدا آدرس سرور را در تنظیمات وارد کنید.");
  const response = await fetch(`${base}/v1/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId: selectedVoice().id, speed: 1 })
  });
  if (!response.ok) {
    let message = "تولید صدا ناموفق بود.";
    try { const body = await response.json(); message = body.error || body.detail || message; } catch (_) {}
    throw new Error(message);
  }
  return response.blob();
}

async function offlineGenerate(text) {
  const result = await requestTtsWorker("synthesize", {
    text,
    voiceId: selectedVoice().id,
    tone: state.tone
  }, updateOfflineProgress);
  return result.wav;
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
    const voiceLabel = item.voiceLabel || voiceProfiles[item.voice]?.label || "گوینده";
    return `<div class="history-item"><div class="history-info"><span class="history-text">${escapeHtml(item.text.slice(0, 88))}</span><span class="history-date">${when} · ${escapeHtml(voiceLabel)} · MP3 · ${escapeHtml(item.toneLabel || "عادی")}</span></div><button class="history-play" type="button" data-history-play="${index}">پخش</button></div>`;
  }).join("");
  $$('[data-history-play]').forEach((button) => {
    button.onclick = async () => {
      const item = history[Number(button.dataset.historyPlay)];
      if (!item?.path) return toast("فایل ذخیره‌شده پیدا نشد.");
      await playPath(item.path);
      const voiceLabel = item.voiceLabel || voiceProfiles[item.voice]?.label || "گوینده";
      $("#outputMeta").textContent = `${voiceLabel} · ${item.toneLabel || "عادی"}`;
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
  if (busy) {
    $("#playerPanel").classList.add("hidden");
    showGenerationProgress(1, label);
  }
}

function showGenerationProgress(percent, label) {
  const panel = $("#generationProgressPanel");
  if (!panel) return;
  clearTimeout(window.__generationProgressTimer);
  panel.classList.remove("hidden");
  $("#generationProgressLabel").textContent = label;
  $("#generationProgressPercent").textContent = `${toFaNumber(Math.round(percent))}٪`;
  $("#generationProgressBar").value = Math.max(0, Math.min(100, percent));
}

function hideGenerationProgressLater() {
  clearTimeout(window.__generationProgressTimer);
  window.__generationProgressTimer = setTimeout(() => $("#generationProgressPanel")?.classList.add("hidden"), 850);
}

async function prepareOffline() {
  if (state.preparing) return;
  state.preparing = true;
  $("#prepareOfflineBtn").disabled = true;
  setEngineStatus(`در حال دریافت مدل ${selectedVoice().label}…`);
  try {
    await requestTtsWorker("prepare", { voiceId: selectedVoice().id }, updateOfflineProgress);
    readyVoiceIds.add(selectedVoice().id);
    toast("مدل آفلاین آماده است.");
  } catch (error) {
    console.error(error);
    setEngineStatus("مدل دریافت نشد");
    toast(error.message || "دریافت مدل ناموفق بود.");
  } finally {
    state.preparing = false;
    $("#prepareOfflineBtn").disabled = false;
    checkOffline();
    if (readyVoiceIds.has(selectedVoice().id) && !state.preloading) {
      window.setTimeout(() => $("#offlineProgressPanel")?.classList.add("hidden"), 800);
    }
  }
}

function checkOffline() {
  const online = state.engine === "online";
  const ready = readyVoiceIds.has(selectedVoice().id);
  $("#engineStatus").textContent = online ? "آنلاین" : "آفلاین";
  $("#prepareOfflineBtn").classList.toggle("hidden", online || ready || state.preloading);
  if (!online && ready) setEngineStatus(`${selectedVoice().label} آماده`);
  else if (!online && state.preloading) setEngineStatus("دریافت خودکار مدل‌های آفلاین…");
  else if (!online) setEngineStatus(`مدل ${selectedVoice().label} آماده‌سازی نشده`);
}

async function startOfflinePreload() {
  if (state.preloading || preloadPromise) return preloadPromise;
  state.preloading = true;
  $("#prepareOfflineBtn").classList.add("hidden");
  $("#offlineProgressPanel").classList.remove("hidden");
  $("#offlineProgressLabel").textContent = "آماده‌سازی مدل‌های آفلاین…";
  const primaryVoiceId = selectedVoice().id;
  try {
    preloadPromise = requestTtsWorker("preload", { primaryVoiceId }, updateOfflineProgress);
    const result = await preloadPromise;
    (result.ready || []).forEach((voiceId) => readyVoiceIds.add(voiceId));
    const failed = result.failed || [];
    if (!failed.length && readyVoiceIds.has(PERSIAN_VOICE_ID) && readyVoiceIds.has(PERSIAN_WOMAN_VOICE_ID)) {
      $("#offlineProgressBar").value = 100;
      $("#offlineProgressLabel").textContent = "مدل‌های آفلاین آماده‌اند";
      setEngineStatus("مدل‌های آفلاین آماده‌اند");
      window.setTimeout(() => $("#offlineProgressPanel")?.classList.add("hidden"), 1100);
    } else {
      const message = failed[0]?.message || "برخی مدل‌ها هنوز آماده نیستند.";
      $("#offlineProgressLabel").textContent = message;
      setEngineStatus("دانلود مدل کامل نشد");
      $("#prepareOfflineBtn").classList.toggle("hidden", readyVoiceIds.has(selectedVoice().id));
    }
  } catch (error) {
    console.error(error);
    $("#offlineProgressLabel").textContent = error.message || "دریافت مدل‌ها ناموفق بود";
    setEngineStatus("دانلود مدل کامل نشد");
    $("#prepareOfflineBtn").classList.remove("hidden");
  } finally {
    state.preloading = false;
    preloadPromise = null;
    checkOffline();
  }
}

function updateEngineUI() {
  const online = state.engine === "online";
  updateVoiceUI();
  $("#onlineToggle").checked = online;
  $("#engineStatus").textContent = online ? "آنلاین" : "آفلاین";
  if (online) {
    $("#modelStatus").textContent = "پردازش آنلاین";
    $("#prepareOfflineBtn").classList.add("hidden");
  }
  else {
    checkOffline();
  }
  startOfflinePreload();
}

async function generate() {
  const raw = $("#textInput").value;
  if (!raw.trim()) return toast("متن را وارد کنید.");
  if (raw.length > MAX_CHARS) return toast("حداکثر ۳۰۰۰ نویسه مجاز است.");
  const text = normalizePersian(raw);
  const tone = toneProfiles[state.tone] || toneProfiles.normal;
  const voice = selectedVoice();
  const childTempoModifier = state.voice === "child" ? 1.15 : 1;
  const childPitchModifier = state.voice === "child" ? 3.5 : 0;
  const tempo = Math.max(0.55, Math.min(1.4, tone.speed * state.speed * childTempoModifier));
  const pitchSemitones = Math.max(-6, Math.min(6, state.pitch + tone.pitch + childPitchModifier));
  setBusy(true, state.engine === "online" ? "در حال دریافت صدا…" : "در حال ساخت صدای آفلاین…");
  try {
    const wav = state.engine === "online" ? await onlineGenerate(text) : await offlineGenerate(text);
    let mp3 = wav;
    if (!wav.type.includes("mpeg")) {
      showGenerationProgress(81, "اعمال تنظیمات صدا…");
      mp3 = await wavBlobToMp3(wav, {
        speed: tempo,
        pitchSemitones,
        onProgress: (percent, phase) => showGenerationProgress(80 + percent * 0.19, phase || "ساخت فایل MP3")
      });
    }
    showGenerationProgress(96, "ذخیرهٔ فایل MP3…");
    const saved = await saveBlobToAppCache(mp3);
    await playPath(saved.path);
    const pitchLabel = pitchSemitones ? ` · زیر‌وبم ${pitchSemitones > 0 ? "+" : ""}${toFaNumber(pitchSemitones.toFixed(1))}` : "";
    $("#outputMeta").textContent = `${voice.label} · ${tone.label} · ${toFaNumber(tempo.toFixed(2))}×${pitchLabel}`;
    $("#outputDuration").textContent = "";
    const history = JSON.parse(localStorage.getItem("voice_history") || "[]");
    history.unshift({ text: raw, path: saved.path, name: saved.name || fileName(), time: Date.now(), tone: state.tone, toneLabel: tone.label, speed: tempo, pitch: pitchSemitones, voice: state.voice, voiceLabel: voice.label, engine: state.engine });
    localStorage.setItem("voice_history", JSON.stringify(history.slice(0, 30)));
    showGenerationProgress(100, "فایل MP3 آماده است");
    toast("فایل MP3 آمادهٔ پخش است.");
    setTimeout(() => $("#playerPanel").scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  } catch (error) {
    console.error(error);
    toast(error.message || "تبدیل صدا انجام نشد.");
  } finally {
    setBusy(false);
    hideGenerationProgressLater();
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
$$('[data-voice]').forEach((button) => {
  button.onclick = () => selectVoice(button.dataset.voice);
});
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
  updateSpeedUI();
  updatePitchUI();
  updateToneUI();
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
  toast("تنظیمات ذخیره شد.", 1100);
};
$("#testOnlineBtn").onclick = testOnline;
$("#clearHistory").onclick = () => {
  if (!JSON.parse(localStorage.getItem("voice_history") || "[]").length) return;
  localStorage.removeItem("voice_history");
  renderHistory();
  toast("تاریخچه پاک شد.");
};
$$('[data-tone]').forEach((button) => {
  button.onclick = () => setTone(button.dataset.tone);
});
$("#speechSpeedRange").addEventListener("input", (event) => {
  state.speed = Math.min(1.4, Math.max(0.6, Number(event.target.value) || 0.82));
  localStorage.setItem("speech_speed", String(state.speed));
  updateSpeedUI();
});
$("#speechPitchRange").addEventListener("input", (event) => {
  state.pitch = Math.min(4, Math.max(-4, Number(event.target.value) || 0));
  localStorage.setItem("speech_pitch", String(state.pitch));
  updatePitchUI();
});
updateToneUI();
updateSpeedUI();
updatePitchUI();
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
