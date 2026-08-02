import "dotenv/config";
import { geminiBase, geminiGenerate, geminiKey } from "../src/utils/gemini.js";

/** диагностика ключа: node scripts/check-gemini.js */

const key = geminiKey();
if (!key) {
  console.error("GEMINI_API_KEY не задан в backend/.env");
  process.exit(1);
}
console.log(`ключ: ${key.slice(0, 6)}…${key.slice(-4)} (${key.length} символов)`);
console.log(`endpoint: ${geminiBase()}`);
console.log(`модель: ${process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash"}`);

const res = await fetch(`${geminiBase()}/models`, { headers: { "x-goog-api-key": key } });
const raw = await res.text();
if (!res.ok) {
  console.error(`\nсписок моделей: http ${res.status}`);
  console.error(raw.slice(0, 800));
  process.exit(1);
}
const names = (JSON.parse(raw).models ?? [])
  .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
  .map((m) => m.name.replace("models/", ""));
console.log(`\nдоступно моделей: ${names.length}`);
console.log(names.join(", "));

try {
  const text = await geminiGenerate({
    messages: [{ role: "user", text: "ответь одним словом: работает" }],
    maxTokens: 50,
  });
  console.log(`\nтестовый ответ: ${text}`);
} catch (e) {
  console.error(`\nтестовый запрос упал: ${e.message}`);
  if (e.detail) console.error(e.detail);
  process.exit(1);
}
