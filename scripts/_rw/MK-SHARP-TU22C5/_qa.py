import re
import sys
from pathlib import Path

root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
INLINE = re.compile(r"`[^`\n]*`")
URL = re.compile(r"https?://\S+")
IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
DASH = re.compile("[\u2014\u2013]")
CAPS = re.compile(r"[A-Z\u0410-\u042f\u0401]")
BANS = [
    "важно отметить",
    "стоит отметить",
    "следует отметить",
    "таким образом",
    "давайте",
    "в данном случае",
    "итак",
    "ключев",
    "мощн",
    "удобн",
    "мы можем",
    "нам надо",
    "в моем случае",
    "допустим",
]


def bare(text):
    t = FENCE.sub("\n", text)
    t = INLINE.sub("", t)
    t = URL.sub("", t)
    t = IMG.sub("", t)
    return t


def main():
    ids = [int(x) for x in sys.argv[1:]] or list(range(11))
    log = []
    for i in ids:
        name = f"{i:03}.md"
        src = (root / "src" / name).read_text(encoding="utf-8")
        outp = root / "out" / name
        if not outp.exists():
            print(f"{i}: NO OUT")
            continue
        out = outp.read_text(encoding="utf-8")
        sp = FENCE.sub("", src)
        op = FENCE.sub("", out)
        ratio = len(op) / len(sp) if sp else 1
        b = bare(out)
        caps = CAPS.findall(b)
        low = op.lower()
        bans = []
        for w in BANS:
            start = 0
            while True:
                k = low.find(w, start)
                if k < 0:
                    break
                bans.append(w + " @" + repr(low[max(0, k - 20) : k + len(w) + 20]))
                start = k + len(w)
        dashes = DASH.findall(op)
        q = b.count("?") + b.count("!")
        line = f"{i}: ratio={ratio:.2f} out={len(op)} src={len(sp)} caps={len(caps)} dash={len(dashes)} ?!={q}"
        log.append(line)
        for item in bans:
            log.append("   BAN " + item)
        if caps:
            for m in CAPS.finditer(b):
                a = max(0, m.start() - 30)
                log.append("   CAP " + repr(b[a : m.start() + 12]))
                break
    text = "\n".join(log)
    (root / "_qa.txt").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
