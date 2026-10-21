from pathlib import Path
import re

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
URL = re.compile(r"https?://[^\s)\]]+")
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
out = root / "_fences.txt"
parts = []
for i in range(148, 159):
    text = (root / "src" / f"{i:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(text)
    prose = FENCE.sub("", text)
    parts.append(f"\n\n======== {i} fences={len(fences)} prose={len(prose)} images={IMAGE.findall(text)} urls={sorted(set(URL.findall(prose)))} ========\n")
    for j, f in enumerate(fences):
        parts.append(f"\n----- {i} fence {j} len={len(f)} -----\n")
        parts.append(f)
        parts.append("\n")
out.write_text("".join(parts), encoding="utf-8")
print("wrote", out, "chars", out.stat().st_size)
