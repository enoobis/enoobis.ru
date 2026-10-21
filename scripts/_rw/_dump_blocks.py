import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\src")
out = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_blocks")
out.mkdir(exist_ok=True)
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)

for i in range(48, 57):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    blocks = FENCE.findall(text)
    parts = []
    for j, b in enumerate(blocks):
        parts.append(f"\n\n########## BLOCK {i:03} #{j} len={len(b)} ##########\n")
        parts.append(b)
        parts.append("\n########## END ##########\n")
    (out / f"{i:03}.txt").write_text("".join(parts), encoding="utf-8")
print("ok", out)
