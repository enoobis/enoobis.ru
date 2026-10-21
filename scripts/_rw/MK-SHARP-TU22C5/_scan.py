import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw")))
import check

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\out")
phrases = [
    "важно отметить",
    "стоит отметить",
    "следует отметить",
    "таким образом",
    "давайте рассмотрим",
    "в данном случае",
    "итак",
    "мощн",
    "ключев",
    "удобн",
    "мы можем",
    "нам надо",
    "в моем случае",
    "в моём случае",
    "допустим",
    "мы ",
    "наш",
]
out_lines = []
for i in range(11):
    text = (root / f"{i:03}.md").read_text(encoding="utf-8")
    prose = check.FENCE.sub("\n", text)
    prose_no_inline = re.sub(r"`[^`\n]*`", "", prose)
    # also strip markdown links urls but keep text
    low = prose_no_inline.lower()
    hits = []
    for p in phrases:
        if p in low:
            hits.append(p)
    if "?" in prose_no_inline or "!" in prose_no_inline:
        hits.append("punct")
    angles = check.bare_angles(text)
    # uppercase letters outside inline and fences
    caps = re.findall(r"[A-ZА-ЯЁ]{1,}", prose_no_inline)
    # filter single letters that might be from headings? report unique short
    cap_sample = sorted(set(caps))[:40]
    out_lines.append(f"{i:03} hits={hits} angles={angles} caps={cap_sample}")
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_scan.txt").write_text(
    "\n".join(out_lines), encoding="utf-8"
)
print("scanned")
