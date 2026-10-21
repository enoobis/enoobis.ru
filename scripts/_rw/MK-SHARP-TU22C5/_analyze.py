import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw")))
import check

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src")
out = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_fence_debug.txt")
lines = []
for i in range(11):
    t = (root / f"{i:03}.md").read_text(encoding="utf-8")
    fences, images, urls = check.parts(t)
    prose = check.FENCE.sub("", t)
    lines.append(
        f"===== {i:03} fences={len(fences)} imgs={len(images)} urls={len(urls)} prose={len(prose)} need60={int(0.6*len(prose))} ====="
    )
    for u in urls:
        lines.append(f"URL {u}")
    for img in images:
        lines.append(f"IMG {img}")
    for j, f in enumerate(fences):
        head = f.split("\n", 1)[0]
        lines.append(f"--- {j} len={len(f)} head={head!r} end={f[-12]!r}")
out.write_text("\n".join(lines), encoding="utf-8")
print("ok")
