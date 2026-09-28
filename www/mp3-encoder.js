import { Mp3Encoder } from "@breezystack/lamejs";

function fourCC(view, offset) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function wavToMonoPcm16(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 44 || fourCC(view, 0) !== "RIFF" || fourCC(view, 8) !== "WAVE") {
    throw new Error("قالب صدای خروجی WAV معتبر نیست.");
  }

  let cursor = 12;
  let format = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (cursor + 8 <= view.byteLength) {
    const id = fourCC(view, cursor);
    const size = view.getUint32(cursor + 4, true);
    const start = cursor + 8;
    if (start + size > view.byteLength) break;
    if (id === "fmt " && size >= 16) {
      format = {
        code: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        bits: view.getUint16(start + 14, true)
      };
    } else if (id === "data") {
      dataOffset = start;
      dataSize = size;
      break;
    }
    cursor = start + size + (size & 1);
  }

  if (!format || dataOffset < 0 || !format.sampleRate || format.channels < 1 || format.channels > 2) {
    throw new Error("اطلاعات صوتی WAV قابل‌خواندن نیست.");
  }
  if (![8, 16, 24, 32].includes(format.bits) || ![1, 3].includes(format.code)) {
    throw new Error("نوع دادهٔ صوتی WAV پشتیبانی نمی‌شود.");
  }
  if (format.code === 3 && format.bits !== 32) throw new Error("قالب WAV شناور پشتیبانی نمی‌شود.");

  const bytesPerSample = format.bits / 8;
  const frameSize = bytesPerSample * format.channels;
  const frames = Math.floor(dataSize / frameSize);
  const mono = new Int16Array(frames);
  const toFloat = (offset) => {
    if (format.code === 3) return view.getFloat32(offset, true);
    if (format.bits === 8) return (view.getUint8(offset) - 128) / 128;
    if (format.bits === 16) return view.getInt16(offset, true) / 32768;
    if (format.bits === 24) {
      let value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
      if (value & 0x800000) value |= 0xff000000;
      return value / 8388608;
    }
    return view.getInt32(offset, true) / 2147483648;
  };

  for (let frame = 0; frame < frames; frame++) {
    let sample = 0;
    for (let channel = 0; channel < format.channels; channel++) {
      sample += toFloat(dataOffset + frame * frameSize + channel * bytesPerSample);
    }
    sample = Math.max(-1, Math.min(1, sample / format.channels));
    mono[frame] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
  }
  return { samples: mono, sampleRate: format.sampleRate };
}

function changeTempo(samples, speed) {
  const ratio = Math.max(0.9, Math.min(1.1, Number(speed) || 1));
  if (Math.abs(ratio - 1) < 0.001) return samples;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const output = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const left = Math.min(samples.length - 1, Math.floor(position));
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = position - left;
    output[i] = Math.round(samples[left] + (samples[right] - samples[left]) * fraction);
  }
  return output;
}

export async function wavBlobToMp3(blob, { speed = 1, onProgress } = {}) {
  const { samples: rawSamples, sampleRate } = wavToMonoPcm16(await blob.arrayBuffer());
  const samples = changeTempo(rawSamples, speed);
  const encoder = new Mp3Encoder(1, sampleRate, 96);
  const chunks = [];
  const blockSize = 1152;

  for (let offset = 0; offset < samples.length; offset += blockSize) {
    const bytes = encoder.encodeBuffer(samples.subarray(offset, Math.min(offset + blockSize, samples.length)));
    if (bytes.length) chunks.push(bytes);
    if (offset % (blockSize * 100) === 0) {
      onProgress?.(Math.min(99, Math.floor((offset / samples.length) * 100)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(tail);
  onProgress?.(100);
  return new Blob(chunks, { type: "audio/mpeg" });
}
