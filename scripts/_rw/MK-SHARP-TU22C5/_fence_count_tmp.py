import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src")
for i in range(169, 177):
    t = (root / f"{i:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(t)
    prose = FENCE.sub("", t)
    print(f"{i}: fences={len(fences)} prose_chars={len(prose)} need>={int(0.6 * len(prose))} total={len(t)}")
    for j, f in enumerate(fences):
        first = f.split("\n", 1)[0]
        print(f"  [{j}] {first!r} len={len(f)}")
