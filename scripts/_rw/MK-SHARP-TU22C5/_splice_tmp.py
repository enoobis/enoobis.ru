import re
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
log = []

def pieces(text):
    out = []
    pos = 0
    for m in FENCE.finditer(text):
        out.append(text[pos:m.start()])
        out.append(m.group(0))
        pos = m.end()
    out.append(text[pos:])
    return out

for i in (190, 191, 192, 193):
    src = (root / "src" / f"{i}.md").read_text(encoding="utf-8")
    dst_path = root / "out" / f"{i}.md"
    dst = dst_path.read_text(encoding="utf-8")
    sp = pieces(src)
    dp = pieces(dst)
    src_f = [p for p in sp if p.startswith("```")]
    dst_f = [p for p in dp if p.startswith("```")]
    log.append(f"{i} src_f={len(src_f)} dst_f={len(dst_f)} src_parts={len(sp)} dst_parts={len(dp)}")
    if len(src_f) != len(dst_f) or len(sp) != len(dp):
        log.append("  count mismatch, skip")
        continue
    if src_f and src_f[0] != dst_f[0]:
        log.append("  first diff src " + repr(src_f[0][:80]))
        log.append("  first diff dst " + repr(dst_f[0][:80]))
    rebuilt = []
    for k, (s, d) in enumerate(zip(sp, dp)):
        if k % 2 == 1:
            rebuilt.append(s)
        else:
            rebuilt.append(d)
    text = "".join(rebuilt)
    dst_path.write_text(text, encoding="utf-8", newline="\n")
    log.append("  rewritten")

Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_splice_log.txt").write_text(
    "\n".join(log), encoding="utf-8"
)
