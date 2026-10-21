import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
ROOT = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
OUT = ROOT / "_fences"
OUT.mkdir(exist_ok=True)

lines = []
for i in range(32, 42):
    text = (ROOT / "src" / f"{i:03}.md").read_text(encoding="utf-8")
    fences = list(FENCE.finditer(text))
    lines.append(f"=== {i:03} count={len(fences)} ===")
    for j, m in enumerate(fences):
        f = m.group(0)
        first = f.split("\n", 1)[0]
        lines.append(f"  [{j}] open={first!r} chars={len(f)} newlines={f.count(chr(10))}")
        (OUT / f"{i:03}_{j:02}.txt").write_text(f, encoding="utf-8")
    # prose lengths
    parts = FENCE.split(text)
    lines.append("  prose_lens=" + ",".join(str(len(p)) for p in parts))
(OUT / "index.txt").write_text("\n".join(lines), encoding="utf-8")
print("wrote", OUT / "index.txt")
