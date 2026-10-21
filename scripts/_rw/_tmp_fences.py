import sys
from pathlib import Path

src = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\src")
fence = "```"
for n in range(57, 68):
    t = (src / f"{n:03}.md").read_text(encoding="utf-8")
    print(f"=== {n:03} triples={t.count(fence)} tabs={t.count(chr(9))} len={len(t)} ===")
    idx = 0
    k = 0
    while True:
        i = t.find(fence, idx)
        if i < 0:
            break
        line_end = t.find("\n", i)
        line = t[i:line_end if line_end != -1 else len(t)]
        print(f"  {k:02d} pos={i} {line!r}")
        k += 1
        idx = i + 3
