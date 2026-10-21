# -*- coding: utf-8 -*-
import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
ROOT = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
DASH = re.compile("[\u2014\u2013]")
UPPER = re.compile(r"[A-ZА-ЯЁ]")
BANNED = [
    "важно отметить", "стоит отметить", "следует отметить", "таким образом",
    "давайте рассмотрим", "в данном случае", "итак", "ключевой", "мощный",
    "удобный инструмент", "мы можем", "нам надо", "допустим",
]
out_lines = []
for idx in range(148, 159):
    name = f"{idx:03d}.md"
    src = (ROOT / "src" / name).read_text(encoding="utf-8")
    text = (ROOT / "out" / name).read_text(encoding="utf-8")
    sf, of = FENCE.findall(src), FENCE.findall(text)
    same = sf == of
    prose = re.sub(r"`[^`\n]*`", "", FENCE.sub("", text))
    src_prose = FENCE.sub("", src)
    ratio = len(prose) / len(src_prose) if src_prose else 0
    issues = []
    if not same:
        issues.append(f"fences differ {len(sf)} vs {len(of)}")
    if DASH.search(FENCE.sub("", text)):
        issues.append("dash")
    low = prose.lower()
    for b in BANNED:
        if b in low:
            issues.append("banned:" + b)
    bare = re.findall(r"<[A-Za-z/!][^>\n]*>", prose)
    if bare:
        issues.append("angles:" + ",".join(bare[:4]))
    ups = []
    for m in UPPER.finditer(prose):
        snippet = prose[max(0, m.start()-25):m.start()+18].replace("\n", " ")
        ups.append(snippet)
        if len(ups) >= 6:
            break
    out_lines.append(f"## {idx} ratio={ratio:.2f} fences_ok={same} issues={issues}")
    for u in ups:
        out_lines.append("  UP " + u)
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_scan_out.txt").write_text("\n".join(out_lines), encoding="utf-8")
print("wrote scan")
