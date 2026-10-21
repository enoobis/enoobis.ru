import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)

for i in range(48, 57):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    blocks = FENCE.findall(text)
    print(f"===== {i:03}")
    for j, b in enumerate(blocks):
        for n, line in enumerate(b.split("\n")):
            if line.endswith(" ") or line.endswith("\t") or "\t" in line:
                print(f"  b{j} L{n}: {line!r}")
