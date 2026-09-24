const ALLOWED_MODELS = new Set(["eleven_v3", "eleven_multilingual_v2"]);
const MAX_CHARS = 12000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" }
  });
}

function clamp(n, min, max, fallback) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ status: "ok", service: "avaye-iran-azad-gateway", version: "1.0.0" });
    }

    if (!env.ELEVENLABS_API_KEY) return json({ error: "Gateway API secret is not configured." }, 500);

    if (url.pathname === "/v1/voices" && request.method === "GET") {
      const r = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Accept": "application/json" }
      });
      const body = await r.text();
      return new Response(body, { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/v1/tts" && request.method === "POST") {
      try {
        const body = await request.json();
        const text = String(body.text || "").trim();
        const voiceId = String(body.voiceId || "").trim();
        const modelId = String(body.modelId || "eleven_v3");
        if (!text) return json({ error: "متن خالی است." }, 400);
        if (text.length > MAX_CHARS) return json({ error: `حداکثر ${MAX_CHARS} کاراکتر مجاز است.` }, 413);
        if (!voiceId) return json({ error: "Voice ID مشخص نشده است." }, 400);
        if (!ALLOWED_MODELS.has(modelId)) return json({ error: "مدل مجاز نیست." }, 400);

        const payload = {
          text,
          model_id: modelId,
          voice_settings: {
            stability: clamp(body.stability, 0, 1, 0.5),
            similarity_boost: 0.75,
            style: clamp(body.style, 0, 1, 0.65),
            use_speaker_boost: true,
            speed: clamp(body.speed, 0.7, 1.2, 1)
          }
        };

        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: {
            "xi-api-key": env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
          },
          body: JSON.stringify(payload)
        });

        if (!r.ok) {
          const errorText = await r.text();
          return json({ error: `ElevenLabs: ${errorText.slice(0, 1200)}` }, r.status);
        }

        return new Response(r.body, {
          status: 200,
          headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }
        });
      } catch (e) {
        return json({ error: "درخواست Gateway نامعتبر است." }, 400);
      }
    }

    return json({ error: "Not found" }, 404);
  }
};
