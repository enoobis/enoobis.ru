import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
ROOT = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src")
OUT = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_fences\map.txt")
chunks = []
for i in (35, 37, 39, 40, 41):
    text = (ROOT / f"{i:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(text)
    chunks.append(f"=== {i:03} ===")
    for j, f in enumerate(fences):
        body = f.split("\n", 1)[1]
        # first non-empty line
        lines = [ln for ln in body.split("\n") if ln.strip()]
        head = lines[0][:120] if lines else ""
        tail = lines[-2][:120] if len(lines) > 1 else ""
        chunks.append(f"[{j}] {head}")
        if tail and tail != head:
            chunks.append(f"    ~ {tail}")
OUT.write_text("\n".join(chunks), encoding="utf-8")
print("ok", len(chunks))
