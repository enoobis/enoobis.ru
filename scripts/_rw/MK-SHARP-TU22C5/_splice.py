import sys
from pathlib import Path

sys.path.insert(0, str(Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw")))
import check

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
for i in range(11):
    name = f"{i:03}.md"
    src = (root / "src" / name).read_text(encoding="utf-8")
    fences = check.FENCE.findall(src)
    path = root / "out" / name
    text = path.read_text(encoding="utf-8")
    for j, fence in enumerate(fences):
        token = f"@@FENCE_{j}@@"
        if token not in text:
            raise SystemExit(f"{name}: missing {token}, fences={len(fences)}")
        text = text.replace(token, fence, 1)
    if "@@FENCE_" in text:
        raise SystemExit(f"{name}: extra fence token")
    path.write_text(text, encoding="utf-8", newline="\n")
    print(name, "fences", len(fences))
print("spliced")
