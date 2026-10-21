import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
for i in range(68, 79):
    t = (root / f"{i:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(t)
    prose = FENCE.sub("", t)
    print(
        f"{i}: fences={len(fences)} prose_chars={len(prose)} "
        f"em={prose.count(chr(0x2014))} en={prose.count(chr(0x2013))}"
    )
    for j, f in enumerate(fences):
        first = f.split("\n", 1)[0]
        print(f"  [{j}] {first!r} len={len(f)}")
