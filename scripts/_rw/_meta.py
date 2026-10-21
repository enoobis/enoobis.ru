import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
URL = re.compile(r"https?://[^\s)\]]+")

for i in range(48, 57):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    prose = FENCE.sub("", text)
    print(f"===== {i:03}")
    print("IMAGES", IMAGE.findall(text))
    print("URLS", sorted(set(URL.findall(prose))))
    # headings
    for line in text.splitlines():
        if line.startswith("#"):
            print("H", line)
