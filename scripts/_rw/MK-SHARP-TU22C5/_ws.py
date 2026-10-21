from pathlib import Path
import re

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
for i in range(148, 159):
    text = (root / "src" / f"{i:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(text)
    print(f"=== {i} n={len(fences)}")
    for j, f in enumerate(fences):
        flags = []
        if "\t" in f:
            flags.append("TAB")
        if " \n" in f or f.endswith(" "):
            flags.append("TRAIL")
        if "\r" in f:
            flags.append("CR")
        # opening line
        first = f.split("\n", 1)[0]
        if first != first.rstrip():
            flags.append("OPEN_TRAIL")
        if flags:
            print(f"  fence {j}: {flags} open={first!r} len={len(f)}")
print("done")
