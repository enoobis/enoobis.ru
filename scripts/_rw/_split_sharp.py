import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src")
out = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_sharp_split")
out.mkdir(exist_ok=True)
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
URL = re.compile(r"https?://[^\s)\]]+")

for i in range(169, 177):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    fences = list(FENCE.finditer(text))
    prose = FENCE.sub("", text)
    lines = [f"fences={len(fences)} prose_len={len(prose)}"]
    lines.append("images=" + repr(IMAGE.findall(prose)))
    lines.append("urls=" + repr(sorted(set(URL.findall(prose)))))
    last = 0
    n = 0
    for m in fences:
        pre = text[last:m.start()]
        (out / f"{i:03}_p{n:02}.txt").write_text(pre, encoding="utf-8")
        (out / f"{i:03}_f{n:02}.txt").write_text(m.group(0), encoding="utf-8")
        first = m.group(0).split("\n", 1)[0]
        lines.append(f"  {n}: {first} len={len(m.group(0))} prose_before={len(pre)}")
        last = m.end()
        n += 1
    (out / f"{i:03}_p{n:02}.txt").write_text(text[last:], encoding="utf-8")
    lines.append(f"  tail prose={len(text[last:])}")
    (out / f"{i:03}_index.txt").write_text("\n".join(lines), encoding="utf-8")
print("done")
