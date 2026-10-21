import re
from collections import Counter
from pathlib import Path

BASE = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
BT = "`"

out = []
for i in range(103, 114):
    t = (BASE / f"{i:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(t)
    prose = FENCE.sub("", t)
    runs = Counter(len(m) for m in re.findall(r"`+", t))
    out.append(
        f"=== {i} chars={len(t)} fences={len(fences)} prose={len(prose)} "
        f"cr={t.count(chr(13))} runs={dict(runs)}"
    )
    # first 12 lines repr
    lines = t.splitlines()
    out.append("-- head --")
    for n, line in enumerate(lines[:8], 1):
        out.append(f"{n}: {line!r}")

for i in range(103, 114):
    t = (BASE / f"{i:03}.md").read_text(encoding="utf-8")
    out.append(f"\n==== {i} FENCE INDEX ====")
    for n, f in enumerate(FENCE.findall(t)):
        lines = [ln.strip() for ln in f.splitlines() if ln.strip()]
        label = lines[1] if len(lines) > 1 else lines[0]
        out.append(f"#{n} {lines[0]} | {label[:90]}")

Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_analyze_cpp.txt").write_text(
    "\n".join(out), encoding="utf-8"
)
print("ok")
