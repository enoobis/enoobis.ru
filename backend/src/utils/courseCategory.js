const PREFIX = [
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

export function categoryFromCode(code) {
  const c = String(code ?? "").toUpperCase();
  for (const [prefix, name] of PREFIX) {
    if (c.startsWith(prefix)) return name;
  }
  return "";
}
