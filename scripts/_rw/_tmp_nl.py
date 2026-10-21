from pathlib import Path
src = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\src\057.md").read_bytes()
out = Path(r"C:\Users\user\Desktop\fggdfg\scripts\_rw\MK-CPP-TUTO2646\out\057.md").read_bytes()
print("src crlf", src.count(b"\r\n"), "lf", src.count(b"\n"), "len", len(src))
print("out crlf", out.count(b"\r\n"), "lf", out.count(b"\n"), "len", len(out))
print("src head", src[:80])
print("out head", out[:120])
# first code fence region
i = src.find(b"```cpp")
print("SRC BLOCK", src[i:i+180])
print("---")
j = out.find(b"```cpp")
print("OUT BLOCK", out[j:j+180])
