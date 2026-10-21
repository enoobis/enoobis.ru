import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw")))
import check

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646")
inline = re.compile(r"`[^`\n]*`")
upper = re.compile(r"[A-ZА-ЯЁ]")
out_lines = []
for i in range(33, 45):
    text = (root / "out" / f"{i:03}.md").read_text(encoding="utf-8")
    prose = inline.sub(" ", check.FENCE.sub(" ", text))
    ups = []
    for m in upper.finditer(prose):
        ups.append(prose[max(0, m.start() - 24): m.end() + 24].replace("\n", " "))
        if len(ups) >= 8:
            break
    qs = prose.count("?") + prose.count("!")
    out_lines.append(f"{i}: questions={qs} uppers={len(list(upper.finditer(prose)))}")
    for u in ups:
        out_lines.append("  " + u)
(Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw") / "_audit_cpp2646.txt").write_text(
    "\n".join(out_lines), encoding="utf-8"
)
