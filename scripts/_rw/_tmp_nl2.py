from pathlib import Path
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\out")
for p in sorted(root.glob("*.md"))[:8]:
    b = p.read_bytes()
    print(p.name, "crlf", b.count(b"\r\n"), "lf", b.count(b"\n"), "cr", b.count(b"\r"), "len", len(b))
src = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\src")
print("--- src sample ---")
for p in list(sorted(src.glob("05*.md")))[:3]:
    b = p.read_bytes()
    print(p.name, "crlf", b.count(b"\r\n"), "lf", b.count(b"\n"), "cr", b.count(b"\r"))
