from pathlib import Path
text = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\src\039.md").read_text(encoding="utf-8")
key = "person.Age = -23"
i = text.find(key)
print("idx", i)
chunk = text[i-400:i+500]
chunk = chunk.replace("`", "<BT>")
Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-SHARP-TU22C5\_fences\snip039.txt").write_text(chunk, encoding="utf-8")
print("wrote", len(chunk))
