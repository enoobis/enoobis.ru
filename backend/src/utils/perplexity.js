const API_URL = "https://api.perplexity.ai/chat/completions";

export function perplexityKey() {
  return process.env.PERPLEXITY_API_KEY?.trim() ?? "";
}

export function perplexityEnabled() {
  return perplexityKey().length > 0;
}

function modelName() {
  return process.env.PERPLEXITY_MODEL?.trim() || "sonar";
}

/**
 * @param {{ system: string, user: string, maxTokens?: number, recency?: string }} opts
 * @returns {Promise<string>}
 */
export async function perplexitySearch(opts) {
  const key = perplexityKey();
  if (!key) throw new Error("news_disabled");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName(),
        temperature: 0.65,
        max_tokens: opts.maxTokens ?? 2200,
        return_images: true,
        search_recency_filter: opts.recency ?? "week",
        search_domain_filter: [
          "shazoo.ru",
          "ixbt.com",
          "3dnews.ru",
          "playground.ru",
        ],
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: ctrl.signal,
    });
  } catch {
    throw new Error("news_unreachable");
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail = payload?.error?.message ?? raw.slice(0, 200);
    console.error(`perplexity ${res.status}: ${detail}`);
    throw new Error("news_failed");
  }

  const text = String(payload?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("news_empty");
  return text;
}
