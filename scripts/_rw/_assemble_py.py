import re
import sys
from pathlib import Path

base = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F")
stage = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_stage_py")
src_root = base / "src"
out_root = base / "out"
out_root.mkdir(exist_ok=True)
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
DASH = re.compile("[\u2014\u2013]")
UPPER = re.compile(r"[A-ZА-ЯЁ]")
FORBIDDEN = [
    "важно отметить",
    "стоит отметить",
    "следует отметить",
    "таким образом",
    "давайте рассмотрим",
    "в данном случае",
    "итак",
    "ключевой",
    "ключевое",
    "мощный",
    "удобн",
    "мы можем",
    "нам надо",
    "допустим",
]

report = []
for i in range(36, 48):
    name = f"{i:03}.md"
    src = (src_root / name).read_text(encoding="utf-8")
    fences = FENCE.findall(src)
    text = (stage / name).read_text(encoding="utf-8")
    if text.count("@@FENCE_") != len(fences):
        print(f"{name}: tokens {text.count('@@FENCE_')} fences {len(fences)}")
    for j, fence in enumerate(fences):
        token = f"@@FENCE_{j}@@"
        if token not in text:
            print(f"{name}: missing {token}")
            continue
        text = text.replace(token, fence, 1)
    if "@@FENCE_" in text:
        print(f"{name}: leftover token")
    (out_root / name).write_text(text, encoding="utf-8", newline="\n")
    prose = FENCE.sub("", text)
    src_prose = FENCE.sub("", src)
    bare = re.sub(r"`[^`\n]*`", "", prose)
    # images alt may contain letters; drop image markdown before case check
    bare_no_img = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", bare)
    ups = UPPER.findall(bare_no_img)
    problems = []
    if DASH.search(prose):
        problems.append("dash")
    if ups:
        problems.append("upper:" + "".join(sorted(set(ups))))
        # show context
        for m in UPPER.finditer(bare_no_img):
            a = max(0, m.start() - 30)
            problems.append("  ..." + bare_no_img[a:m.end() + 20].replace("\n", " ") + "...")
            if len(problems) > 8:
                break
    low = bare_no_img.lower()
    for phrase in FORBIDDEN:
        idx = low.find(phrase)
        if idx >= 0:
            problems.append("forbidden:" + phrase + " :: " + low[max(0, idx - 40):idx + 40].replace("\n", " "))
    if " а не " in low or "это не " in low:
        problems.append("contrast")
        for m in re.finditer(r".{0,40}(а не |это не ).{0,40}", low):
            problems.append("  C:" + m.group(0).replace("\n", " "))
    ratio = len(prose) / len(src_prose) if src_prose else 1
    if ratio < 0.6:
        problems.append(f"short {ratio:.2f} {len(prose)}/{len(src_prose)}")
    else:
        print(f"{name}: prose {len(prose)}/{len(src_prose)} = {ratio:.2f}")
    if problems:
        report.append(f"{name} PROBLEMS")
        for p in problems:
            report.append("  " + p)

Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_stage_py\_report.txt").write_text(
    "\n".join(report), encoding="utf-8"
)
