const PREFIX: [string, string][] = [
  ["MK-PYTHON", "python"],
  ["MK-ASSEMBLE", "ассемблер"],
  ["MK-COMMON", "общее"],
  ["MK-VISUALBA", "visual basic"],
  ["MK-KOTLIN", "kotlin"],
  ["MK-NOSQL", "nosql"],
  ["MK-SHARP", "c#"],
  ["MK-SWIFT", "swift"],
  ["MK-DART", "dart"],
  ["MK-JAVA", "java"],
  ["MK-CPP", "c++"],
  ["MK-RUST", "rust"],
  ["MK-PHP", "php"],
  ["MK-SQL", "sql"],
  ["MK-WEB", "веб"],
  ["MK-OS", "операционные системы"],
  ["MK-GO", "go"],
  ["MK-F", "f#"],
  ["MK-JS", "javascript"],
  ["MK-AI", "ai"],
  ["MK-HOSTING", "хостинг"],
  ["MK-C", "c"],
];

export function categoryFromCode(code: string): string {
  const c = (code ?? "").toUpperCase();
  for (const [prefix, name] of PREFIX) {
    if (c.startsWith(prefix)) return name;
  }
  return "";
}

export function courseCategory(c: { category?: string; course_code?: string }): string {
  return (c.category ?? "").trim() || categoryFromCode(c.course_code ?? "");
}

export function categoryMatches(cat: string, q: string): boolean {
  const c = cat.toLowerCase();
  if (!q) return false;
  if (c === q || c.includes(q)) return true;
  if (q === "web" && c === "веб") return true;
  if ((q === "os" || q === "linux") && c.includes("операцион")) return true;
  return false;
}
