const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";
/** если заданной модели нет — пробуем эти по очереди */
const TEXT_FALLBACKS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
/** чат тьютора: самая дешёвая линейка, 3.1-lite дороже в 3–4 раза */
const CHAT_DEFAULT_MODEL = "gemini-2.5-flash-lite";
const CHAT_FALLBACKS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"];

export function geminiKey() {
  return process.env.GEMINI_API_KEY?.trim() ?? "";
}

/** прокси на случай, если из региона сервера google api недоступен */
export function geminiBase() {
  return (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
}

export function geminiEnabled() {
  return geminiKey().length > 0;
}

function textModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function chatModel() {
  return process.env.GEMINI_CHAT_MODEL?.trim() || CHAT_DEFAULT_MODEL;
}

function modelChain(primary, fallbacks) {
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

/**
 * @param {string} code
 * @param {string} [detail]
 */
function aiError(code, detail) {
  const e = new Error(code);
  if (detail) e.detail = detail;
  return e;
}

/** ключ передаём заголовком, поэтому в теле ошибки его не бывает */
function describeUpstream(status, payload) {
  const message = payload?.error?.message ?? "";
  const reason = payload?.error?.status ?? "";
  const short = String(message).slice(0, 300);
  if (/location is not supported/i.test(message)) {
    return { code: "ai_region_blocked", detail: short };
  }
  if (status === 429) return { code: "ai_rate_limited", detail: short };
  if (status === 400 && /api key/i.test(message)) return { code: "ai_key_invalid", detail: short };
  if (status === 400) return { code: "ai_bad_request", detail: short };
  if (status === 401 || status === 403) {
    return { code: "ai_key_forbidden", detail: short || reason };
  }
  if (status === 404) return { code: "ai_model_missing", detail: short };
  if (status >= 500) return { code: "ai_upstream", detail: short };
  return { code: "ai_failed", detail: short || `http ${status}` };
}

async function callGemini(model, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${geminiBase()}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw aiError("ai_unreachable");
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
    const { code, detail } = describeUpstream(res.status, payload);
    console.error(`gemini ${model} ${res.status} ${code}: ${detail ?? ""}`);
    throw aiError(code, detail);
  }
  return payload;
}

/** thinkingConfig понимают только 2.5-модели, остальные отвечают 400 */
function bodyForModel(model, body) {
  if (/2\.5/.test(model) || !body.generationConfig?.thinkingConfig) return body;
  const { thinkingConfig: _drop, ...generationConfig } = body.generationConfig;
  return { ...body, generationConfig };
}

/** перебираем модели, пока не найдётся существующая */
async function callWithFallback(models, body, timeoutMs) {
  let last = null;
  for (const model of models) {
    try {
      return await callGemini(model, bodyForModel(model, body), timeoutMs);
    } catch (e) {
      last = e;
      if (e.message !== "ai_model_missing") throw e;
    }
  }
  throw last ?? aiError("ai_failed");
}

function blockedDetail(payload) {
  const candidate = payload?.candidates?.[0];
  const blockReason = payload?.promptFeedback?.blockReason;
  if (blockReason) return `запрос отклонён фильтром: ${blockReason}`;
  if (candidate?.finishReason === "SAFETY") return "ответ отклонён фильтром безопасности";
  if (candidate?.finishReason === "MAX_TOKENS") return "ответ не поместился в лимит токенов";
  return candidate?.finishReason ? `finishReason: ${candidate.finishReason}` : undefined;
}

/**
 * @param {{ system?: string, messages: { role: "user" | "model", text: string }[], maxTokens?: number, json?: boolean, think?: boolean, cheap?: boolean, temperature?: number }} opts
 * @returns {Promise<string>}
 */
export async function geminiGenerate(opts) {
  if (!geminiKey()) throw aiError("ai_disabled");

  const contents = opts.messages
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  if (!contents.length) throw aiError("empty_prompt");

  const body = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 1200,
      // 2.5 тратит maxOutputTokens на «мышление» и возвращает пустой ответ с MAX_TOKENS
      ...(opts.think ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const models = opts.cheap
    ? modelChain(chatModel(), CHAT_FALLBACKS)
    : modelChain(textModel(), TEXT_FALLBACKS);
  const data = await callWithFallback(models, body, 60_000);
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? "").join("").trim();
  if (!text) throw aiError("ai_empty", blockedDetail(data));
  return humanize(text);
}

/** длинное тире — самый заметный след ии-текста, промпта мало */
function humanize(text) {
  return text.replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2").replace(/\s*[—–]\s*/g, " - ");
}

/**
 * Models sometimes wrap json in ```json fences even with responseMimeType set.
 * @param {string} raw
 */
export function parseJsonLoose(raw) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}
