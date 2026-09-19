const GLUE = [
  [/коллекциии/gi, "коллекции"],
  [/обработкаисключений/gi, "обработка исключений"],
  [/файловойсистемой/gi, "файловой системой"],
  [/файловойсистемы/gi, "файловой системы"],
  [/протоколомhttp/gi, "протоколом http"],
  [/patternmatching/gi, "pattern matching"],
  [/перечислениякласса/gi, "перечисления класса"],
  [/расширениякласса/gi, "расширения класса"],
  [/переопределениеоператор/gi, "переопределение оператор"],
];

const FAKE_NUM = { в: "6", "/": "7" };

export function prettyCourseTitle(raw) {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^глава(?=\S)/i, "глава ");
  s = s.replace(/^глава\s+([в/])(?=\.)/i, (_, ch) => `глава ${FAKE_NUM[ch] ?? ch}`);
  s = s.replace(/^(глава\s+\d+)\.(?=\S)/i, "$1. ");
  s = s.replace(/([a-z])\.([а-яё])/gi, "$1. $2");
  s = s.replace(/([а-яё])\.([a-z])/gi, "$1. $2");
  s = s.replace(/([a-z])([а-яё])/gi, "$1 $2");
  s = s.replace(/([а-яё])([a-z])/gi, "$1 $2");
  for (const [re, to] of GLUE) s = s.replace(re, to);
  s = s.replace(/([а-яё])(исключений|многопоточность|системой|операторов|класса)/gi, "$1 $2");
  return s.replace(/\s+/g, " ").trim();
}

export function isChapterHeading(title) {
  return /^глава\s+\d/i.test(prettyCourseTitle(title));
}
