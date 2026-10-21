import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
out = []
for i in range(11):
    p = root / f"{i:03}.md"
    t = p.read_text(encoding="utf-8")
    fences = list(FENCE.finditer(t))
    out.append(
        f"=== {i:03} count={len(fences)} crlf={t.count(chr(13))} prose={len(FENCE.sub('', t))}"
    )
    for j, m in enumerate(fences):
        s = m.group(0)
        head = s[:80].replace("\n", "\\n").replace("\r", "\\r")
        tail = s[-50:].replace("\n", "\\n").replace("\r", "\\r")
        out.append(f"  [{j}] pos={m.start()} len={len(s)}\n    HEAD={head}\n    TAIL={tail}")
# urls and images after fence removal
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
URL = re.compile(r"https?://[^\s)\]]+")
extra = []
for i in range(11):
    t = (root / f"{i:03}.md").read_text(encoding="utf-8")
    prose = FENCE.sub("", t)
    extra.append(f"=== {i:03} urls")
    for u in sorted(set(URL.findall(prose))):
        extra.append("  " + u)
    extra.append(f"=== {i:03} images")
    for im in IMAGE.findall(t):
        extra.append("  " + im)
    # dashes
    dashes = sorted(set(re.findall(r"[\u2014\u2013]", prose)))
    extra.append(f"=== {i:03} dashes {dashes!r} count={len(re.findall(r'[\u2014\u2013]', prose))}")

# shift line
t10 = (root / "010.md").read_text(encoding="utf-8")
idx = t10.find("Операции сдвига")
extra.append("SHIFT SLICE:")
extra.append(t10[idx:idx+900])
# 006 dashes context
t6 = (root / "006.md").read_text(encoding="utf-8")
for m in re.finditer(r".{40}[\u2014\u2013].{40}", t6):
    extra.append("D6 " + m.group(0).replace("\n", " "))
t7 = (root / "007.md").read_text(encoding="utf-8")
for m in re.finditer(r".{30}[\u2014\u2013].{30}", t7):
    extra.append("D7 " + m.group(0).replace("\n", " "))

Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_meta.txt").write_text(
    "\n".join(extra), encoding="utf-8"
)
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_fences.txt").write_text(
    "\n".join(out), encoding="utf-8"
)
print("ok", len(out))
