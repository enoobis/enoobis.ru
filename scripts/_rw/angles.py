import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.S)
for path in sys.argv[1:]:
    t = Path(path).read_text(encoding="utf-8")
    p = re.sub(r"`[^`\n]*`", "", FENCE.sub("", t))
    for m in re.finditer(r"<[A-Za-z/!][^>\n]*>", p):
        print(path, "|", p[max(0, m.start() - 60) : m.end() + 10].replace("\n", " "))
