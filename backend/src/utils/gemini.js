const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

export function geminiKey() {
  return process.env.GEMINI_API_KEY?.trim() ?? "";
}

export function geminiEnabled() {
  return geminiKey().length > 0;
}

function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * @param {{ system?: string, messages: { role: "user" | "model", text: string }[], maxTokens?: number, json?: boolean }} opts
 * @returns {Promise<string>}
 */
export async function geminiGenerate(opts) {
  const key = geminiKey();
  if (!key) throw new Error("ai_disabled");

  const contents = opts.messages
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  if (!contents.length) throw new Error("empty_prompt");

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: opts.maxTokens ?? 1200,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  let res;
  try {
    res = await fetch(`${API_ROOT}/${geminiModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new Error("ai_unreachable");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // never leak the upstream payload — it can echo the key back
    console.error("gemini error:", res.status);
    throw new Error(res.status === 429 ? "ai_rate_limited" : "ai_failed");
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? "").join("").trim();
  if (!text) throw new Error("ai_empty");
  return text;
}

/**
 * Models sometimes wrap json in ```json fences even with responseMimeType set.
 * @param {string} raw
 */
export function parseJsonLoose(raw) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}
