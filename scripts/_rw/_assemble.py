from pathlib import Path
import re

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
ROOT = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646")
PROSE = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_prose")
IDS = ["076", "077", "078", "079", "080", "081", "082", "083"]

for n in IDS:
    src = (ROOT / "src" / f"{n}.md").read_text(encoding="utf-8")
    blocks = FENCE.findall(src)
    prose = (PROSE / f"{n}.md").read_text(encoding="utf-8")
    parts = prose.split("@@CODE@@")
    if len(parts) != len(blocks) + 1:
        raise SystemExit(f"{n}: markers {len(parts) - 1}, blocks {len(blocks)}")
    chunks = []
    for i, block in enumerate(blocks):
        chunks.append(parts[i].strip("\n"))
        chunks.append("\n\n")
        chunks.append(block)
        chunks.append("\n\n")
    chunks.append(parts[-1].strip("\n"))
    chunks.append("\n")
    text = "".join(chunks)
    (ROOT / "out" / f"{n}.md").write_text(text, encoding="utf-8")
    print(n, "blocks", len(blocks), "out", len(text))
