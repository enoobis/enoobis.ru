import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src")
out_dir = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_prose")
out_dir.mkdir(exist_ok=True)
for i in range(148, 159):
    src = (root / f"{i:03d}.md").read_text(encoding="utf-8")
    parts = []
    last = 0
    n = 0
    for m in FENCE.finditer(src):
        prose = src[last:m.start()]
        # normalize weird newlines for reading only
        norm = prose.replace("\r\n", "\n").replace("\r", "\n")
        parts.append(f"\n\n===== PROSE before fence {n} =====\n")
        parts.append(norm)
        parts.append(f"\n===== FENCE {n} lang={m.group(0).split(chr(10))[0]!r} len={len(m.group(0))} =====\n")
        n += 1
        last = m.end()
    prose = src[last:]
    norm = prose.replace("\r\n", "\n").replace("\r", "\n")
    parts.append(f"\n\n===== PROSE tail =====\n")
    parts.append(norm)
    (out_dir / f"{i:03d}.txt").write_text("".join(parts), encoding="utf-8", newline="\n")
print("ok", n)
