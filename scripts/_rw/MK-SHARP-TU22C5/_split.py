import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
src = root / "src"
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
out_dir = root / "_prose"
out_dir.mkdir(exist_ok=True)
for i in range(11):
    t = (src / f"{i:03}.md").read_text(encoding="utf-8")
    parts = FENCE.split(t)
    lines = [f"SEGMENTS {len(parts)}"]
    for j, p in enumerate(parts):
        lines.append(f"\n===== SEG {j} len={len(p)} =====\n")
        lines.append(p)
    (out_dir / f"{i:03}.txt").write_text("".join(lines), encoding="utf-8")
print("ok")
