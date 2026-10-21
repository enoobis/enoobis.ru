import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
for i in range(48, 57):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    prose = FENCE.sub("", text)
    compact = re.sub(r"\n{2,}", "\n", prose).strip()
    print(f"{i:03} prose={len(prose)} compact={len(compact)} need60={int(len(prose)*0.6)}")
