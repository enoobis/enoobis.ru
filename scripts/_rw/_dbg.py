import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\src")
out_dir = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_skel")
out_dir.mkdir(exist_ok=True)
for i in range(114, 124):
    t = (root / f"{i:03}.md").read_text(encoding="utf-8")
    parts = FENCE.split(t)
    blocks = FENCE.findall(t)
    chunks = []
    for n, prose in enumerate(parts):
        snippet = " ".join(prose.split())
        if len(snippet) > 220:
            snippet = snippet[:220] + " ..."
        chunks.append(f"--- prose {n} ({len(prose)} chars) ---\n{snippet}\n")
        if n < len(blocks):
            first = blocks[n].split("\n", 1)[0]
            chunks.append(f"@@FENCE:{n}@@  [{first}] len={len(blocks[n])}\n")
    (out_dir / f"{i:03}.txt").write_text("".join(chunks), encoding="utf-8")
print("ok", len(blocks) if False else "done")
