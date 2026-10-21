import re
import sys
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)


def stitch(idx: int) -> None:
    src = (root / "src" / f"{idx:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(src)
    rew_path = root / "_rew" / f"{idx:03}.md"
    rew = rew_path.read_text(encoding="utf-8")
    if rew.startswith("\ufeff"):
        rew = rew[1:]
    parts = rew.split("\n<<<F>>>\n")
    if len(parts) != len(fences) + 1:
        raise SystemExit(
            f"{idx}: prose parts {len(parts)}, expected {len(fences) + 1} (fences {len(fences)})"
        )
    buf = []
    for i, part in enumerate(parts):
        buf.append(part)
        if i < len(fences):
            if part and not part.endswith("\n"):
                buf.append("\n")
            buf.append(fences[i])
            buf.append("\n")
    text = "".join(buf)
    if not text.endswith("\n"):
        text += "\n"
    out = root / "out" / f"{idx:03}.md"
    out.write_text(text, encoding="utf-8")
    # verify fences byte-identical
    got = FENCE.findall(text)
    if got != fences:
        raise SystemExit(f"{idx}: fence mismatch after stitch {len(got)} vs {len(fences)}")
    print(f"stitched {idx:03} fences={len(fences)} chars={len(text)}")


if __name__ == "__main__":
    ids = [int(x) for x in sys.argv[1:]]
    for i in ids:
        stitch(i)
