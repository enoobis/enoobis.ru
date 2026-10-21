from pathlib import Path

base = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646")

for n in [119]:
    src = (base / "src" / f"{n:03}.md").read_text(encoding="utf-8")
    print("=== SRC", n, "===")
    for i, line in enumerate(src.splitlines(), 1):
        s = line.strip()
        if s.startswith("`") or s == "`" or "```" in line:
            print(f"{i}: {line!r}")
