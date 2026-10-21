import re
from pathlib import Path

BASE = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\out")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
INLINE = re.compile(r"`[^`\n]*`")
lines = []
for i in range(103, 114):
    t = (BASE / f"{i:03}.md").read_text(encoding="utf-8")
    bare = INLINE.sub("", FENCE.sub("", t))
    idx = 0
    while True:
        j = bare.find("а не", idx)
        if j < 0:
            break
        lines.append(f"{i}: {bare[max(0, j - 90): j + 60]}")
        lines.append("---")
        idx = j + 3
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_ane.txt").write_text("\n".join(lines), encoding="utf-8")
print(len(lines))
