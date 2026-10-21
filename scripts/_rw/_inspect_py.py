import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
DASH = re.compile("[\u2014\u2013]")

for i in range(48, 57):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    blocks = FENCE.findall(text)
    prose = FENCE.sub("", text)
    print(f"=== {i:03} blocks={len(blocks)} prose_len={len(prose)} total={len(text)} dashes={bool(DASH.search(prose))} ===")
    for j, b in enumerate(blocks):
        print(f"--- block {j} len={len(b)} head={b[:40]!r}")
