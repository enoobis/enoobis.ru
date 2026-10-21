import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
URL = re.compile(r"https?://[^\s)\]]+")
DASH = re.compile("[\u2014\u2013]")

for i in range(36, 48):
    p = root / f"{i:03}.md"
    t = p.read_text(encoding="utf-8")
    fences = FENCE.findall(t)
    prose = FENCE.sub("", t)
    prose_stripped = re.sub(r"`[^`\n]*`", "", prose)
    angles = re.findall(r"<[A-Za-z/!][^>\n]*>", prose_stripped)
    print(
        f"{i:03} fences={len(fences)} prose={len(prose)} "
        f"need={int(0.6*len(prose))} images={IMAGE.findall(t)} "
        f"urls={sorted(set(URL.findall(prose)))} "
        f"dash={bool(DASH.search(prose))} angles={angles} "
        f"fences3={t.count(chr(96)*3)}"
    )
    for j, f in enumerate(fences):
        print(f"  [{j}] lang={f.split(chr(10),1)[0]!r} len={len(f)} starts={f[:40]!r}")
