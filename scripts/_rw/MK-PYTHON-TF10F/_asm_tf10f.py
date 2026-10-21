import re
import sys
from pathlib import Path

ROOT = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
DASH = re.compile("[\u2014\u2013]")
UPPER = re.compile(r"[A-ZА-ЯЁ]")
ANGLE = re.compile(r"<[A-Za-z/!][^>\n]*>")
BANNED = [
    "важно отметить",
    "стоит отметить",
    "следует отметить",
    "таким образом",
    "давайте рассмотрим",
    "в данном случае",
    "итак",
    "ключевой",
    "мощный",
    "удобный инструмент",
    "мы можем",
    "нам надо",
    "в моем случае",
    "в моём случае",
    "допустим",
]


def assemble(idx: int) -> None:
    src = (ROOT / "src" / f"{idx:03}.md").read_text(encoding="utf-8")
    fences = FENCE.findall(src)
    body = (ROOT / "out" / f"{idx:03}.draft.md").read_text(encoding="utf-8")
    for i, fence in enumerate(fences):
        token = f"@@FENCE_{i}@@"
        if token not in body:
            raise SystemExit(f"{idx}: missing {token}")
        body = body.replace(token, fence, 1)
    leftover = re.findall(r"@@FENCE_\d+@@", body)
    if leftover:
        raise SystemExit(f"{idx}: leftover {leftover}")
    (ROOT / "out" / f"{idx:03}.md").write_text(body, encoding="utf-8", newline="\n")
    prose = re.sub(r"`[^`\n]*`", "", FENCE.sub("", body))
    src_prose = FENCE.sub("", src)
    ratio = len(FENCE.sub("", body)) / max(1, len(src_prose))
    uppers = sorted(set(UPPER.findall(prose)))
    hits = [b for b in BANNED if b in prose.lower()]
    angles = ANGLE.findall(prose)
    dashes = DASH.findall(FENCE.sub("", body))
    print(
        f"{idx}: ratio={ratio:.2f} uppers={uppers} dashes={len(dashes)} "
        f"angles={angles} banned={hits}"
    )


if __name__ == "__main__":
    for raw in sys.argv[1:]:
        assemble(int(raw))
