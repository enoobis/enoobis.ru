import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
for i in range(139, 146):
    src = (root / "src" / f"{i:03}.md").read_text(encoding="utf-8")
    out = (root / "out" / f"{i:03}.md").read_text(encoding="utf-8")
    print(
        i,
        "src fences",
        len(FENCE.findall(src)),
        "out fences",
        len(FENCE.findall(out)),
        "src ticks",
        src.count("```"),
        "out ticks",
        out.count("```"),
    )
    for label, text in (("src", src), ("out", out)):
        lines = []
        for n, ln in enumerate(text.splitlines(), 1):
            s = ln.strip()
            if s.startswith("```") or s in ("`", "``", "```"):
                lines.append(f"{n}:{ln}")
        print(" ", label, lines)
