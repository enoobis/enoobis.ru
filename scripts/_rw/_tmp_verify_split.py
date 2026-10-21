from pathlib import Path

src_root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\src")
parts = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_tmp_parts")
for n in range(57, 68):
    t = (src_root / f"{n:03}.md").read_text(encoding="utf-8")
    d = parts / f"{n:03}"
    files = sorted(d.glob("*.txt"), key=lambda p: (p.name[0], p.name))
    # interleave p00, c00, p01, c01, ...
    chunks = []
    i = 0
    while True:
        p = d / f"p{i:02d}.txt"
        c = d / f"c{i:02d}.txt"
        if p.exists():
            chunks.append(p.read_text(encoding="utf-8"))
        if c.exists():
            chunks.append(c.read_text(encoding="utf-8"))
        else:
            break
        i += 1
    joined = "".join(chunks)
    print(n, "OK" if joined == t else f"DIFF {len(joined)} vs {len(t)}")
