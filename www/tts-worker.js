import {
  prefetchPersianVoice,
  preparePersianVoice,
  PERSIAN_VOICE_ID,
  PERSIAN_WOMAN_VOICE_ID
} from "./piper-engine.js";

const VOICE_LABELS = new Map([
  [PERSIAN_VOICE_ID, "صدای مردانه"],
  [PERSIAN_WOMAN_VOICE_ID, "صدای زنانه"]
]);

function send(id, type, data = {}) {
  self.postMessage({ id, type, ...data });
}

function splitSpeechText(text, maxLength = 88) {
  const sentences = text.match(/[^.!?؟…؛،\n]+[.!?؟…؛،\n]*/gu) || [text];
  const output = [];
  let current = "";
  const flush = () => {
    const value = current.trim();
    if (value) output.push(value);
    current = "";
  };

  for (const sentence of sentences) {
    if ((current + sentence).length <= maxLength) {
      current += sentence;
      continue;
    }
    flush();
    if (sentence.length <= maxLength) {
      current = sentence;
      continue;
    }
    let part = "";
    for (const word of sentence.split(/\s+/u)) {
      if (part && (part + " " + word).length > maxLength) {
        output.push(part.trim());
        part = word;
      } else {
        part = part ? `${part} ${word}` : word;
      }
    }
    current = part;
  }
  flush();
  return output.length ? output : [text.trim()];
}

function pauseFor(segment, tone) {
  const sentenceEnd = /[.!?؟…]$/u.test(segment);
  const clauseEnd = /[،؛]$/u.test(segment);
  const base = sentenceEnd ? 150 : clauseEnd ? 85 : 35;
  const multiplier = { normal: 1, formal: 1.3, news: 0.8, cheerful: 0.7, intimate: 1.45 }[tone] || 1;
  return Math.round(base * multiplier);
}

function parseWav(buffer) {
  const view = new DataView(buffer);
  const readTag = (offset) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (buffer.byteLength < 44 || readTag(0) !== "RIFF" || readTag(8) !== "WAVE") throw new Error("فایل WAV میانی معتبر نیست.");
  let offset = 12;
  let format;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.byteLength) {
    const tag = readTag(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > buffer.byteLength) break;
    if (tag === "fmt " && size >= 16) {
      format = { code: view.getUint16(start, true), channels: view.getUint16(start + 2, true), sampleRate: view.getUint32(start + 4, true), bits: view.getUint16(start + 14, true) };
    }
    if (tag === "data") { dataStart = start; dataLength = size; break; }
    offset = start + size + (size & 1);
  }
  if (!format || format.code !== 1 || format.bits !== 16 || !format.sampleRate || dataStart < 0) {
    throw new Error("فرمت PCM خروجی Piper پشتیبانی نمی‌شود.");
  }
  const frames = Math.floor(dataLength / (2 * format.channels));
  const mono = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel++) sum += view.getInt16(dataStart + (i * format.channels + channel) * 2, true);
    mono[i] = Math.round(sum / format.channels);
  }
  return { samples: mono, sampleRate: format.sampleRate };
}

function makeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const tag = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  tag(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); tag(8, "WAVE");
  tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return new Blob([buffer], { type: "audio/wav" });
}

async function combineSegments(blobs, segments, tone) {
  const decoded = [];
  for (const blob of blobs) decoded.push(parseWav(await blob.arrayBuffer()));
  const sampleRate = decoded[0]?.sampleRate || 22050;
  if (decoded.some((part) => part.sampleRate !== sampleRate)) throw new Error("نرخ نمونه‌برداری بخش‌های صدا یکسان نیست.");
  const gaps = decoded.slice(0, -1).map((_, index) => Math.round(sampleRate * pauseFor(segments[index], tone) / 1000));
  const total = decoded.reduce((sum, part) => sum + part.samples.length, 0) + gaps.reduce((sum, gap) => sum + gap, 0);
  const merged = new Int16Array(total);
  let offset = 0;
  decoded.forEach((part, index) => {
    merged.set(part.samples, offset);
    offset += part.samples.length + (gaps[index] || 0);
  });
  return makeWav(merged, sampleRate);
}

async function handlePreload(id, data) {
  const primary = data.primaryVoiceId || PERSIAN_VOICE_ID;
  const order = [...new Set([primary, ...[PERSIAN_VOICE_ID, PERSIAN_WOMAN_VOICE_ID].filter((voiceId) => voiceId !== primary)])];
  const ready = [];
  const failed = [];

  for (const [index, voiceId] of order.entries()) {
    try {
      if (index === 0) {
        await preparePersianVoice(voiceId, (progress) => send(id, "progress", { progress: { ...progress, task: "preload", voiceId, voiceIndex: index, voiceCount: order.length } }));
      } else {
        await prefetchPersianVoice(voiceId, (progress) => send(id, "progress", { progress: { ...progress, task: "preload", voiceId, voiceIndex: index, voiceCount: order.length } }));
      }
      ready.push(voiceId);
      send(id, "voice-ready", { voiceId, voiceLabel: VOICE_LABELS.get(voiceId) || "مدل صدا" });
    } catch (error) {
      failed.push({ voiceId, message: error?.message || "دریافت مدل ناموفق بود." });
      send(id, "voice-error", { voiceId, message: error?.message || "دریافت مدل ناموفق بود." });
    }
  }
  send(id, "result", { result: { ready, failed } });
}

async function handlePrepare(id, data) {
  const voiceId = data.voiceId || PERSIAN_VOICE_ID;
  await preparePersianVoice(voiceId, (progress) => send(id, "progress", { progress: { ...progress, task: "prepare", voiceId } }));
  send(id, "voice-ready", { voiceId, voiceLabel: VOICE_LABELS.get(voiceId) || "مدل صدا" });
  send(id, "result", { result: { voiceId } });
}

async function handleSynthesize(id, data) {
  const voiceId = data.voiceId || PERSIAN_VOICE_ID;
  const text = String(data.text || "").trim();
  if (!text) throw new Error("متنی برای تبدیل وجود ندارد.");
  send(id, "progress", { progress: { task: "generate", phase: "prepare", percent: 2, label: "آماده‌سازی موتور گفتار" } });
  const session = await preparePersianVoice(voiceId, (progress) => send(id, "progress", { progress: { ...progress, task: "generate", voiceId } }));
  const segments = splitSpeechText(text);
  const wavParts = [];

  for (let index = 0; index < segments.length; index++) {
    const before = Math.round(5 + (index / segments.length) * 70);
    send(id, "progress", { progress: { task: "generate", phase: "synthesis", completed: index, total: segments.length, percent: before, label: `در حال ساخت بخش ${index + 1} از ${segments.length}` } });
    wavParts.push(await session.predict(segments[index]));
    const after = Math.round(5 + ((index + 1) / segments.length) * 70);
    send(id, "progress", { progress: { task: "generate", phase: "synthesis", completed: index + 1, total: segments.length, percent: after, label: `تبدیل گفتار · بخش ${index + 1} از ${segments.length}` } });
  }

  send(id, "progress", { progress: { task: "generate", phase: "merge", percent: 78, label: "یکپارچه‌سازی بخش‌های صدا" } });
  const wav = await combineSegments(wavParts, segments, data.tone || "normal");
  send(id, "progress", { progress: { task: "generate", phase: "complete", percent: 80, label: "آماده‌سازی فایل صوتی" } });
  send(id, "result", { result: { wav } });
}

self.addEventListener("message", (event) => {
  const { id, type } = event.data || {};
  if (!id) return;
  const run = type === "preload" ? handlePreload(id, event.data)
    : type === "prepare" ? handlePrepare(id, event.data)
      : type === "synthesize" ? handleSynthesize(id, event.data)
        : Promise.reject(new Error("درخواست worker شناخته نشد."));
  Promise.resolve(run).catch((error) => send(id, "error", { message: error?.message || "پردازش صوت ناموفق بود." }));
});
