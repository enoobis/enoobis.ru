import re
import sys
from pathlib import Path

BASE = Path(__file__).parent
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
URL = re.compile(r"https?://[^\s)\]]+")
DASH = re.compile("[\u2014\u2013]")


def parts(text):
    return FENCE.findall(text), [m.split("](")[1] for m in IMAGE.findall(text)], sorted(set(URL.findall(FENCE.sub("", text))))


def bare_angles(text):
    prose = re.sub(r"`[^`\n]*`", "", FENCE.sub("", text))
    return len(re.findall(r"<[A-Za-z/!][^>\n]*>", prose))


def check(root, idx):
    name = f"{idx:03}.md" if (root / "src" / f"{idx:03}.md").exists() else f"{idx:02}.md"
    src = (root / "src" / name).read_text(encoding="utf-8")
    path = root / "out" / name
    if not path.exists():
        return [f"{idx}: нет файла out/{name}"]
    out = path.read_text(encoding="utf-8")
    a, b = parts(src), parts(out)
    errs = []
    if a[0] != b[0]:
        errs.append(f"{idx}: блоки кода отличаются ({len(a[0])} в оригинале, {len(b[0])} в новом)")
        for i, (x, y) in enumerate(zip(a[0], b[0])):
            if x != y:
                errs.append(f"   первый отличающийся блок #{i}:\n{y[:300]}")
                break
    if a[1] != b[1]:
        errs.append(f"{idx}: картинки отличаются {a[1]} != {b[1]}")
    missing = [u for u in a[2] if u not in b[2]]
    if missing:
        errs.append(f"{idx}: пропали ссылки {missing}")
    if DASH.search(FENCE.sub("", out)):
        errs.append(f"{idx}: есть длинное тире")
    if len(FENCE.sub("", out)) < 0.6 * len(FENCE.sub("", src)):
        errs.append(f"{idx}: текст сильно короче оригинала, похоже что-то выкинуто")
    return errs


if __name__ == "__main__":
    args = sys.argv[1:]
    root = BASE
    if args and args[0].startswith("MK-"):
        root = BASE / args.pop(0)
    ids = [int(x) for x in args] or [int(p.stem) for p in sorted((root / "src").glob("*.md"))]
    errs = [e for i in ids for e in check(root, i)]
    print("\n".join(errs) if errs else "ok")
