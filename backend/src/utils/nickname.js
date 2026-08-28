import { GIVEN_NAMES_TEXT } from "./givenNames.js";

const NICKNAME_RE = /^[A-Za-z]{3,24}$/;

export const NICKNAME_RULE_TEXT = "3-24 латинские буквы";

const RESERVED = split(`
  admin administrator admins moderator moder mod mods staff official
  support system security root owner help guest test tester tests
  api www http https null undefined anonymous anon everyone here all
  enoobis enoob enoo enobis bot robot server host mail email
  copilot openai google microsoft apple telegram instagram
`);

const GIVEN_NAMES = split(GIVEN_NAMES_TEXT);

const PROFANE_STRONG = split(`
  fuck fck fuk fuxk fucc fuckin fucking
  shit sh1t
  bitch btch
  cunt
  nigger nigga
  faggot fagot
  retard retarded
  whore slut
  penis pussy dildo
  porn porno xxxnudes
  pizda pizd pizdec pizdets
  huy hui xuy xyj huilo huinya huynya
  blyat blyad bljad blyatb
  eban ebat eblan eblanina
  mudak mudak mudila
  pidar pidor pedik pederast
  churka churki
  sukablyat
  scheisse scheise arschloch hurensohn wichser fotze
  putain connard salope encule ntm nique
  caonima cnmb nmsl shabi wocao
  kuso kutabare unsco unko
  hitler nazi swastika
`);

const PROFANE_EXACT = split(`
  ass dick cock tit tits boob boobs sex sexy
  suka sucka suca
  hernya
  arsch
  merde
  cao
  kuso
`);

function split(s) {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

function deleet(s) {
  return s
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function lettersOnly(s) {
  return s.replace(/[^a-z]/g, "");
}

function tokens(s) {
  return s.split(/[._]+/).filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function nicknameError(raw) {
  const n = String(raw ?? "").trim();
  if (!NICKNAME_RE.test(n)) return NICKNAME_RULE_TEXT;

  const low = n.toLowerCase();
  const core = lettersOnly(low);
  const core2 = deleet(core);
  const parts = tokens(low).map((t) => deleet(lettersOnly(t)));

  if (RESERVED.has(low) || RESERVED.has(core) || RESERVED.has(core2)) {
    return "этот ник занят системой";
  }

  const nameHits = [core, core2, ...parts].filter((p) => p.length >= 3 && GIVEN_NAMES.has(p));
  if (nameHits.length) return "это имя, выбери ник";

  const hay = `${low} ${core} ${core2} ${parts.join(" ")}`;
  for (const w of PROFANE_STRONG) {
    if (hay.includes(w)) return "так нельзя";
  }
  for (const p of [low, core, core2, ...parts]) {
    if (PROFANE_EXACT.has(p)) return "так нельзя";
  }
  return null;
}

/**
 * @param {unknown} n
 * @returns {boolean}
 */
export function isValidNickname(n) {
  return nicknameError(n) === null;
}
