import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw")))
import check

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\out")
needles = ["таким образом", "мы ", "допустим", "ключев", "?", "!", "стоит ", "следует "]
lines = []
for i in range(11):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    prose = check.FENCE.sub("\n", text)
    prose_no_inline = re.sub(r"`[^`\n]*`", "", prose)
    low = prose_no_inline.lower()
    for n in needles:
        start = 0
        while True:
            j = low.find(n, start)
            if j < 0:
                break
            frag = prose_no_inline[max(0, j - 40): j + 50].replace("\n", " ")
            lines.append(f"{i:03} [{n}] {frag}")
            start = j + len(n)
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_scan2.txt").write_text(
    "\n".join(lines), encoding="utf-8"
)
print(len(lines))
