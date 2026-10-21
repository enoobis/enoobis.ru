import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646")
lines = []
for i in range(68, 76):
    src = (root / "src" / f"{i:03}.md").read_text(encoding="utf-8")
    out = (root / "out" / f"{i:03}.md").read_text(encoding="utf-8")
    a, b = FENCE.findall(src), FENCE.findall(out)
    lines.append(f"{i} src={len(a)} out={len(b)} eq={a==b} cr={out.count(chr(13))}")
    if a != b:
        for j, (x, y) in enumerate(zip(a, b)):
            if x != y:
                lines.append(f"  diff block {j} src_len={len(x)} out_len={len(y)}")
                lines.append("  SRC " + repr(x[:120]))
                lines.append("  OUT " + repr(y[:120]))
                break
        if len(a) != len(b):
            lines.append(f"  count mismatch extra out starts: {b[len(a)][:80]!r}" if len(b) > len(a) else "  missing")
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_scan_out.txt").write_text("\n".join(lines), encoding="utf-8")
