import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src")
out = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_tmp_fences_sharp")
out.mkdir(exist_ok=True)
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
URL = re.compile(r"https?://[^\s)\]]+")

for i in range(169, 177):
    raw = (root / f"{i:03}.md").read_bytes()
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n") - crlf
    text = raw.decode("utf-8")
    fences = FENCE.findall(text)
    prose = FENCE.sub("", text)
    imgs = IMAGE.findall(text)
    urls = sorted(set(URL.findall(prose)))
    print(f"{i}: bytes={len(raw)} crlf={crlf} lf_only={lf} fences={len(fences)} prose={len(prose)} need>={int(0.6*len(prose))} imgs={imgs} urls={urls} triples={text.count('```')}")
    dump = out / f"{i:03}.txt"
    parts = []
    for j, f in enumerate(fences):
        parts.append(f"===== FENCE {j} len={len(f)} =====\n")
        parts.append(f)
        parts.append("\n===== END =====\n")
    dump.write_text("".join(parts), encoding="utf-8")
