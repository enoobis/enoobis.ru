from pathlib import Path

src_root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\src")
out_root = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_tmp_parts")
fence = "```"
for n in range(57, 68):
    t = (src_root / f"{n:03}.md").read_text(encoding="utf-8")
    d = out_root / f"{n:03}"
    d.mkdir(parents=True, exist_ok=True)
    parts = []
    idx = 0
    k = 0
    while True:
        i = t.find(fence, idx)
        if i < 0:
            parts.append(("p", t[idx:]))
            break
        parts.append(("p", t[idx:i]))
        j = t.find(fence, i + 3)
        # closing fence is the next line that is exactly ```
        # find the closing ``` that starts a line
        search = i + 3
        end = None
        while True:
            j = t.find("\n" + fence, search)
            if j < 0:
                raise SystemExit(f"no close {n}")
            # line is ``` or ```lang ? closing is a line whose content is exactly ```
            line_end = t.find("\n", j + 1)
            if line_end < 0:
                line_end = len(t)
            line = t[j + 1:line_end]
            if line.strip() == fence and not line.startswith(fence + fence[0] if False else "x"):
                if line == fence or line.rstrip("\r") == fence:
                    end = line_end + 1 if line_end < len(t) and t[line_end:line_end+1] == "\n" else line_end
                    # include the newline after closing fence if present? the fence line includes newline if we take line_end+?
                    # store from i through the end of the closing line including its newline
                    end = line_end
                    if end < len(t) and t[end] == "\n":
                        end += 1
                    break
            search = j + 1
        (d / f"c{k:02d}.txt").write_text(t[i:end], encoding="utf-8")
        k += 1
        idx = end
    # write prose
    pi = 0
    # recompute prose simply
    text = t
    pos = 0
    ci = 0
    prose_i = 0
    cursor = 0
    for cpath in sorted(d.glob("c*.txt")):
        block = cpath.read_text(encoding="utf-8")
        at = text.find(block, cursor)
        prose = text[cursor:at]
        (d / f"p{prose_i:02d}.txt").write_text(prose, encoding="utf-8")
        prose_i += 1
        cursor = at + len(block)
        ci += 1
    (d / f"p{prose_i:02d}.txt").write_text(text[cursor:], encoding="utf-8")
    print(n, "codes", ci, "prose", prose_i + 1)
