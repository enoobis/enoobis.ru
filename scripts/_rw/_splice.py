# -*- coding: utf-8 -*-
import re
import sys
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
ROOT = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
BANNED = [
    "важно отметить",
    "стоит отметить",
    "следует отметить",
    "таким образом",
    "давайте рассмотрим",
    "в данном случае",
    "итак",
    "ключевой",
    "мощный",
    "удобный инструмент",
    "мы можем",
    "нам надо",
    "в моем случае",
    "допустим",
    "это не ",
]
DASH = re.compile("[\u2014\u2013]")
UPPER = re.compile(r"[A-ZА-ЯЁ]")


def strip_inline(text):
    return re.sub(r"`[^`\n]*`", "", text)


def check_style(idx, text):
    errs = []
    prose = strip_inline(FENCE.sub("", text))
    if DASH.search(prose):
        errs.append(f"{idx}: dash")
    low = prose.lower()
    for b in BANNED:
        if b in low:
            errs.append(f"{idx}: banned '{b}'")
    # uppercase outside fences and inline code
    for m in UPPER.finditer(prose):
        start = max(0, m.start() - 30)
        snippet = prose[start:m.start() + 20].replace("\n", " ")
        errs.append(f"{idx}: upper {m.group()} near '{snippet}'")
        if len([e for e in errs if e.startswith(f"{idx}: upper")]) >= 8:
            errs.append(f"{idx}: more uppercase omitted")
            break
    bare = re.findall(r"<[A-Za-z/!][^>\n]*>", prose)
    if bare:
        errs.append(f"{idx}: bare angles {bare[:6]}")
    return errs


def splice(ids):
    all_errs = []
    for idx in ids:
        name = f"{idx:03d}.md"
        src = (ROOT / "src" / name).read_text(encoding="utf-8")
        fences = FENCE.findall(src)
        path = ROOT / "out" / name
        text = path.read_text(encoding="utf-8")
        # tokens before splice
        for i, fence in enumerate(fences):
            token = f"@@FENCE:{i}@@"
            if token not in text:
                all_errs.append(f"{idx}: missing {token}")
            else:
                text = text.replace(token, fence, 1)
        if "@@FENCE:" in text:
            all_errs.append(f"{idx}: leftover token")
        all_errs.extend(check_style(idx, text))
        with path.open("w", encoding="utf-8", newline="") as out:
            out.write(text)
        # verify fences identical
        got = FENCE.findall(path.read_text(encoding="utf-8"))
        if got != fences:
            all_errs.append(f"{idx}: fence mismatch after write {len(got)} vs {len(fences)}")
    print("\n".join(all_errs) if all_errs else "style ok")


if __name__ == "__main__":
    ids = [int(x) for x in sys.argv[1:]]
    splice(ids)
