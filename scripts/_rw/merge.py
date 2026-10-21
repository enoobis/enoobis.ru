import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).parent
SEEDS = BASE.parents[1] / "backend" / "seed" / "courses" / "lectures"


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def render(data):
    head = {k: v for k, v in data.items() if k != "lectures"}
    return dump(head)[:-1] + ',"lectures":[\n' + ",\n".join("  " + dump(l) for l in data["lectures"]) + "\n]}\n"


SEGMENT = re.compile(r"(```[^\n]*\n.*?```|`[^`\n]*`)", re.S)
TAG = re.compile(r"<([A-Za-z/!][^<>\n]*)>")


def escape_angles(text, src):
    known = set(TAG.findall(src))
    parts = SEGMENT.split(text)
    for i in range(0, len(parts), 2):
        parts[i] = TAG.sub(lambda m: m.group(0) if m.group(1) in known else "&lt;" + m.group(1) + "&gt;", parts[i])
    return "".join(parts)


def split(code):
    seed = SEEDS / f"{code}.json"
    raw = seed.read_text(encoding="utf-8")
    data = json.loads(raw)
    assert render(data) == raw, f"{code}: формат json не совпадает"
    src = BASE / code / "src"
    src.mkdir(parents=True, exist_ok=True)
    (BASE / code / "out").mkdir(exist_ok=True)
    for i, lec in enumerate(data["lectures"]):
        (src / f"{i:03}.md").write_text(lec["body"], encoding="utf-8")
    print(code, len(data["lectures"]))


def merge(code):
    seed = SEEDS / f"{code}.json"
    root = BASE if code == "MK-DART-TUT4059" else BASE / code
    data = json.loads(seed.read_text(encoding="utf-8"))
    done = 0
    for i, lec in enumerate(data["lectures"]):
        for name in (f"{i:03}.md", f"{i:02}.md"):
            out = root / "out" / name
            if out.exists():
                lec["body"] = escape_angles(out.read_text(encoding="utf-8").strip(), lec["body"])
                done += 1
                break
    seed.write_text(render(data), encoding="utf-8")
    print(code, "merged", done, "of", len(data["lectures"]))


if __name__ == "__main__":
    cmd, *codes = sys.argv[1:]
    for c in codes:
        (split if cmd == "split" else merge)(c)
