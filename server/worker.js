const MAX_CHARS = 12000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function backendConfig(env) {
  const base = String(env.PIPER_API_URL || "").trim().replace(/\/$/, "");
  const token = String(env.PIPER_API_TOKEN || "").trim();
  if (!base || !token) return null;
  return { base, token };
}

async function backendFetch(config, path, init = {}) {
  return fetch(`${config.base}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "Authorization": `Bearer ${config.token}`
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const config = backendConfig(env);
    if (!config) return json({ error: "تنظیمات PIPER_API_URL و PIPER_API_TOKEN روی Worker کامل نیست." }, 503);

    if (url.pathname === "/health" && request.method === "GET") {
      try {
        const response = await fetch(`${config.base}/health`, { headers: { "Cache-Control": "no-cache" } });
        const body = await response.text();
        return new Response(body, {
          status: response.status,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
        });
      } catch (_) {
        return json({ status: "error", error: "سرور Piper در دسترس نیست." }, 502);
      }
    }

    if (url.pathname === "/v1/voices" && request.method === "GET") {
      try {
        const response = await backendFetch(config, "/v1/voices");
        const body = await response.text();
        return new Response(body, {
          status: response.status,
          headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
        });
      } catch (_) {
        return json({ error: "ارتباط با سرور Piper برقرار نشد." }, 502);
      }
    }

    if (url.pathname === "/v1/tts" && request.method === "POST") {
      try {
        const body = await request.json();
        const text = String(body.text || "").trim();
        const voiceId = String(body.voiceId || "fa_IR-amir-medium").trim();
        if (!text) return json({ error: "متن خالی است." }, 400);
        if (text.length > MAX_CHARS) return json({ error: `حداکثر ${MAX_CHARS} کاراکتر مجاز است.` }, 413);
        if (voiceId !== "fa_IR-amir-medium") return json({ error: "این API فعلاً فقط صدای فارسی امیر را پشتیبانی می‌کند." }, 400);

        const response = await backendFetch(config, "/v1/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "audio/wav" },
          body: JSON.stringify({ text, voiceId, speed: clamp(body.speed, 0.7, 1.2, 1.0) })
        });
        if (!response.ok) {
          const bodyText = await response.text();
          let message = bodyText.slice(0, 1200);
          try { message = JSON.parse(bodyText).detail || message; } catch (_) {}
          return json({ error: `Piper: ${message}` }, response.status);
        }
        return new Response(response.body, {
          status: 200,
          headers: { ...cors, "Content-Type": "audio/wav", "Cache-Control": "no-store" }
        });
      } catch (error) {
        if (error instanceof SyntaxError) return json({ error: "درخواست JSON معتبر نیست." }, 400);
        return json({ error: "ارتباط با سرویس Piper برقرار نشد." }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  }
};
