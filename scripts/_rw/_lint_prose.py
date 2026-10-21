import re
from pathlib import Path

FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
INLINE = re.compile(r"`[^`\n]*`")
root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-PYTHON-TF10F\out")
ids = ["026", "027", "028", "029", "030", "031", "032", "033", "034", "035"]
banned = [
    "важно отметить",
    "стоит отметить",
    "следует отметить",
    "таким образом",
    "давайте рассмотрим",
    "в данном случае",
    "итак",
    "ключевой",
    "ключевым",
    "ключевыми",
    "мощный",
    "удобный инструмент",
    "мы можем",
    "нам надо",
    "допустим",
]
report = []
for idx in ids:
    text = (root / f"{idx}.md").read_text(encoding="utf-8")
    prose = FENCE.sub("\n", text)
    prose = re.sub(r"<<<FENCE:\d+>>>", "", prose)
    prose_wo = INLINE.sub("", prose)
    lines = [f"== {idx} =="]
    if re.search("[\u2014\u2013]", prose_wo):
        lines.append("  DASH")
    for m in re.finditer(r".{0,40} - .{0,40}", prose_wo):
        lines.append("  HYPHEN " + m.group(0).replace("\n", " "))
    cases = list(re.finditer(r"[A-ZА-ЯЁ]", prose_wo))
    lines.append(f"  CASECOUNT {len(cases)}")
    for m in cases[:20]:
        start = max(0, m.start() - 24)
        lines.append("   " + prose_wo[start:m.start() + 16].replace("\n", " "))
    low = prose_wo.lower()
    for b in banned:
        if b in low:
            lines.append("  BANNED " + b)
    if "?" in prose_wo:
        lines.append("  QUESTION")
    for m in re.finditer(r".{0,40}[!]{1}.{0,40}", prose_wo):
        lines.append("  BANG " + m.group(0).replace("\n", " "))
    for b in ["ключев", "допустим", "таким образом", "важно ", "стоит "]:
        start = 0
        low = prose_wo.lower()
        while True:
            i = low.find(b, start)
            if i < 0:
                break
            lines.append("  HIT " + b + " :: " + prose_wo[max(0, i - 30):i + 40].replace("\n", " "))
            start = i + len(b)
    report.append("\n".join(lines))
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_lint_report.txt").write_text(
    "\n\n".join(report), encoding="utf-8"
)
