from pathlib import Path
parts = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\_tmp_parts")
for n in range(57, 68):
    d = parts / f"{n:03}"
    print(f"\n===== {n:03} =====")
    i = 0
    while (d / f"p{i:02d}.txt").exists():
        text = (d / f"p{i:02d}.txt").read_text(encoding="utf-8")
        one = " ".join(text.split())
        print(f"p{i:02d} len={len(text)} | {one[:140]}")
        i += 1
