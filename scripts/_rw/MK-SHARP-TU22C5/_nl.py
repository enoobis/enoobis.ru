from pathlib import Path
import re

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")

for n in ["147", "148"]:
    src = (root / "src" / f"{n}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(src)
    print("===", n, "fences", len(fences))
    if fences:
        f = fences[0]
        print("len", len(f), "cr", f.count("\r"), "lf", f.count("\n"))
        print(repr(f[:200]))
        print("---end---")
        print(repr(f[-60:]))

src = (root / "src" / "147.md").read_text(encoding="utf-8")
out = (root / "out" / "147.md").read_text(encoding="utf-8")
a, b = FENCE.findall(src), FENCE.findall(out)
print("147 match", a == b, len(a), len(b))
if a and b:
    print("src0 cr", a[0].count("\r"), "out0 cr", b[0].count("\r"))
    print("out start", repr(b[0][:80]))

raw = (root / "src" / "148.md").read_bytes()
print("rrn", raw.count(b"\r\r\n"), "rn", raw.count(b"\r\n"))
print("head", repr(raw[:180]))
