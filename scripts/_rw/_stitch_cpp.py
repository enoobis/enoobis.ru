import re
import sys
from pathlib import Path

BASE = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
INLINE = re.compile(r"`[^`\n]*`")
DASH = re.compile("[\u2014\u2013]")
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
    "допустим",
]
UPPER = re.compile(r"[A-ZА-ЯЁ]")

ids = list(range(103, 114))
for i in ids:
    src = (BASE / "src" / f"{i:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(src)
    path = BASE / "out" / f"{i:03}.md"
    text = path.read_text(encoding="utf-8")
    for n in range(len(fences) - 1, -1, -1):
        token = f"@@FENCE_{n}@@"
        if token not in text:
            sys.exit(f"{i}: missing {token}")
        text = text.replace(token, fences[n], 1)
    if "@@FENCE_" in text:
        sys.exit(f"{i}: leftover token")
    path.write_text(text, encoding="utf-8", newline="\n")

    prose = FENCE.sub("", text)
    src_prose = FENCE.sub("", src)
    ratio = len(prose) / len(src_prose) if src_prose else 1
    bare = INLINE.sub("", prose)
    ups = UPPER.findall(bare)
    dashes = DASH.findall(prose)
    bans = [b for b in BANNED if b in prose.lower() or b in bare.lower()]
    # also search lowercase prose
    low = bare.lower()
    bans = [b for b in BANNED if b in low]
    contrast = bare.count("а не")
    print(
        f"{i}: fences={len(fences)} ratio={ratio:.2f} upper={len(ups)} "
        f"dash={len(dashes)} banned={bans} ane={contrast}"
    )
    if ups:
        # show context
        for m in UPPER.finditer(bare):
            a = max(0, m.start() - 30)
            print("   ", repr(bare[a:m.start() + 20]))
            break
print("stitched")
