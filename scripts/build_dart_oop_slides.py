# -*- coding: utf-8 -*-
import html
import json
import re
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

SRC = Path(r"C:\Users\user\Desktop\fggdfg\backend\seed\courses\lectures\MK-DART-TUT4059.json")
OUT_DIR = Path(r"C:\Users\user\Desktop")
PPTX_PATH = OUT_DIR / "dart-oop-full.pptx"
PDF_PATH = OUT_DIR / "dart-oop-full.pdf"

W, H = Inches(13.333), Inches(7.5)
BG = RGBColor(0x0A, 0x0A, 0x0A)
FG = RGBColor(0xF5, 0xF5, 0xF5)
MUTED = RGBColor(0x9A, 0x9A, 0x9A)
CODE_BG = RGBColor(0x12, 0x12, 0x12)
LINE = RGBColor(0x2A, 0x2A, 0x2A)

PDF_BG = HexColor("#0a0a0a")
PDF_FG = HexColor("#f5f5f5")
PDF_MUTED = HexColor("#9a9a9a")
PDF_CODE = HexColor("#121212")
PDF_LINE = HexColor("#2a2a2a")

FONT_UI = r"C:\Windows\Fonts\times.ttf"
FONT_UI_B = r"C:\Windows\Fonts\timesbd.ttf"
FONT_CODE = r"C:\Windows\Fonts\consola.ttf"
UI_NAME = "Times New Roman"

SYNTAX = {
    "plain": "#d4d4d4",
    "kw": "#c586c0",
    "type": "#4ec9b0",
    "str": "#ce9178",
    "num": "#b5cea8",
    "com": "#6a9955",
    "ann": "#dcdcaa",
}
KEYWORDS = {
    "abstract", "as", "assert", "async", "await", "base", "break", "case", "catch", "class",
    "const", "continue", "covariant", "default", "deferred", "do", "dynamic", "else", "enum",
    "export", "extends", "extension", "external", "factory", "false", "final", "finally", "for",
    "get", "if", "implements", "import", "in", "interface", "is", "late", "library", "mixin",
    "new", "null", "on", "operator", "part", "required", "rethrow", "return", "sealed", "set",
    "show", "static", "super", "switch", "sync", "this", "throw", "true", "try", "typedef",
    "var", "void", "when", "while", "with", "yield",
}
BUILTIN_TYPES = {"int", "double", "num", "bool", "dynamic", "void"}
TOKEN = re.compile(
    r"(//.*$|/\*.*?(?:\*/|$))"
    r"|('(?:\\.|[^'\\])*'?|\"(?:\\.|[^\"\\])*\"?)"
    r"|(@\w+)"
    r"|(\b\d+(?:\.\d+)?\b)"
    r"|(\b[A-Za-z_$][\w$]*\b)"
    r"|(\s+|.)"
)


def is_code(text: str) -> bool:
    return any(ch in text for ch in ";{}")


def highlight(line: str, code: bool = True) -> list[tuple[str, str]]:
    if not code:
        return [(line, SYNTAX["plain"])]
    out = []
    for m in TOKEN.finditer(line):
        com, st, ann, num, ident, other = m.groups()
        if com:
            out.append((com, SYNTAX["com"]))
        elif st:
            out.append((st, SYNTAX["str"]))
        elif ann:
            out.append((ann, SYNTAX["ann"]))
        elif num:
            out.append((num, SYNTAX["num"]))
        elif ident:
            if ident in BUILTIN_TYPES or ident[0].isupper():
                out.append((ident, SYNTAX["type"]))
            elif ident in KEYWORDS:
                out.append((ident, SYNTAX["kw"]))
            else:
                out.append((ident, SYNTAX["plain"]))
        else:
            out.append((other, SYNTAX["plain"]))
    return out

DASHES = str.maketrans({
    "\u2014": "-",
    "\u2013": "-",
    "\u2012": "-",
    "\u2015": "-",
    "\u2212": "-",
})


def clean(s: str) -> str:
    s = html.unescape(s or "").translate(DASHES)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = s.replace("```", "")
    s = re.sub(r"[ \t]+\n", "\n", s)
    return s.strip()


def wrap(text: str, width: int) -> list[str]:
    lines = []
    for raw in text.split("\n"):
        raw = raw.strip()
        if not raw:
            lines.append("")
            continue
        words = raw.split()
        cur = ""
        for w in words:
            test = f"{cur} {w}".strip()
            if len(test) <= width:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
    return lines


def parse_blocks(body: str) -> list[dict]:
    body = (body or "").translate(DASHES).replace("\r\n", "\n").replace("\r", "\n")
    blocks = []
    i = 0
    lines = body.split("\n")
    n = len(lines)
    para = []

    def flush_para():
        text = " ".join(x.strip() for x in para if x.strip())
        para.clear()
        text = clean(text)
        if text:
            blocks.append({"kind": "text", "text": text})

    while i < n:
        line = lines[i]
        fence = re.match(r"^```(\w+)?\s*$", line.strip())
        if fence:
            flush_para()
            i += 1
            code = []
            while i < n and not re.match(r"^```\s*$", lines[i].strip()):
                code.append(lines[i].replace("\t", "    ").translate(DASHES))
                i += 1
            if i < n:
                i += 1
            code = [ln for ln in code if not ln.strip().startswith("```")]
            code_text = "\n".join(code).strip("\n")
            if code_text.strip():
                blocks.append({"kind": "code", "text": code_text})
            continue
        heading = re.match(r"^#{1,4}\s+(.+)$", line.strip())
        if heading:
            flush_para()
            blocks.append({"kind": "head", "text": clean(heading.group(1)).lower()})
            i += 1
            continue
        if not line.strip():
            flush_para()
            i += 1
            continue
        inline_fence = re.search(r"```(\w+)?\s*$", line)
        if inline_fence and not line.strip().startswith("```"):
            before = line[: inline_fence.start()].rstrip(" .")
            if before.strip():
                para.append(before)
            flush_para()
            i += 1
            code = []
            while i < n and not re.match(r"^```\s*$", lines[i].strip()):
                code.append(lines[i].replace("\t", "    ").translate(DASHES))
                i += 1
            if i < n:
                i += 1
            code = [ln for ln in code if not ln.strip().startswith("```")]
            code_text = "\n".join(code).strip("\n")
            if code_text.strip():
                blocks.append({"kind": "code", "text": code_text})
            continue
        para.append(line)
        i += 1
    flush_para()
    return blocks


def chunk_text(text: str, max_lines: int = 6, width: int = 68) -> list[str]:
    lines = wrap(text, width)
    chunks, cur = [], []
    for line in lines:
        cur.append(line)
        if len(cur) >= max_lines:
            chunks.append("\n".join(cur).strip())
            cur = []
    if cur:
        chunks.append("\n".join(cur).strip())
    return [c for c in chunks if c]


def wrap_code_line(line: str, width: int = 86) -> list[str]:
    if len(line) <= width:
        return [line]
    out = []
    while line:
        out.append(line[:width])
        line = line[width:]
    return out


def chunk_code(text: str, max_lines: int = 13) -> list[str]:
    lines = []
    for raw in text.split("\n"):
        lines.extend(wrap_code_line(raw.replace("\t", "    "), 86))
    chunks = []
    for i in range(0, max(len(lines), 1), max_lines):
        piece = "\n".join(lines[i : i + max_lines])
        if piece.strip():
            chunks.append(piece)
    return chunks


BASICS = [
    {
        "title": "что такое ооп",
        "text": "объектно-ориентированное программирование это парадигма, в которой программа строится как совокупность взаимодействующих объектов. объект объединяет состояние и поведение и обладает собственной идентичностью. в dart модель последовательна: любое значение, включая числа и null, является экземпляром класса.",
        "code": "print(42.runtimeType);    // int\nprint('dart'.runtimeType); // String\nprint(null.runtimeType);  // Null",
    },
    {
        "title": "класс",
        "text": "класс задаёт тип: описывает структуру состояния через поля и поведение через методы. данных конкретного объекта в классе нет, он определяет, какими будут все его экземпляры. любой класс в dart неявно наследуется от object.",
        "code": "class Person {\n  String name = '';\n  int age = 0;\n\n  void display() => print('$name, $age');\n}",
    },
    {
        "title": "объект",
        "text": "объект, или экземпляр класса, создаётся вызовом конструктора и размещается в динамической памяти. экземпляры одного класса имеют одинаковую структуру, но независимое состояние и разную идентичность.",
        "code": "var a = Person();\nvar b = Person();\nprint(identical(a, b)); // false",
    },
    {
        "title": "поля и методы",
        "text": "поля образуют состояние объекта, методы определяют операции над ним. внутри метода доступна ссылка this на текущий экземпляр. для каждого поля dart неявно создаёт геттер, а для изменяемого ещё и сеттер.",
        "code": "class Person {\n  String name = '';\n  void rename(String name) => this.name = name;\n}",
    },
    {
        "title": "конструктор",
        "text": "конструктор инициализирует объект и гарантирует, что тот с момента создания находится в корректном состоянии. dart поддерживает генеративные, именованные и фабричные конструкторы, а также список инициализации, который выполняется до тела.",
        "code": "class Person {\n  final String name;\n  final int age;\n  Person(this.name, this.age);\n  Person.guest() : name = 'guest', age = 0;\n}",
    },
    {
        "title": "ссылочная семантика",
        "text": "переменная объектного типа хранит ссылку, а не само значение. присваивание копирует ссылку, поэтому после bob = tom обе переменные обозначают один объект, и изменение через одну из них видно через другую.",
        "code": "var tom = Person('tom', 38);\nvar bob = tom;\nbob.name = 'bob';\nprint(tom.name); // bob",
    },
    {
        "title": "инкапсуляция",
        "text": "инкапсуляция ограничивает прямой доступ к состоянию объекта и оставляет внешнему коду контролируемый интерфейс. приватность в dart определяется на уровне библиотеки: идентификатор с префиксом _ недоступен за пределами своего файла.",
        "code": "class Account {\n  int _balance = 0;\n  int get balance => _balance;\n  void deposit(int x) { if (x > 0) _balance += x; }\n}",
    },
    {
        "title": "наследование",
        "text": "наследование задаёт отношение «является»: подкласс получает члены суперкласса и может их расширять или переопределять. dart допускает только одиночное наследование через extends, к реализации родителя обращаются через super.",
        "code": "class Worker extends Person {\n  final String company;\n  Worker(super.name, super.age, this.company);\n}",
    },
    {
        "title": "полиморфизм",
        "text": "полиморфизм подтипов позволяет работать с объектами разных классов через общий тип. реализация метода выбирается во время выполнения по фактическому типу объекта, а не по объявленному типу переменной. это динамическая диспетчеризация.",
        "code": "Person p = Worker('tom', 38, 'acme');\np.display(); // вызовется Worker.display",
    },
    {
        "title": "абстракция",
        "text": "абстракция выделяет существенные свойства сущности и скрывает детали реализации. абстрактный класс нельзя инстанцировать, он может объявлять методы без тела, и конкретные подклассы обязаны их реализовать.",
        "code": "abstract class Shape {\n  double area();\n}\n\nclass Square extends Shape {\n  final double side;\n  Square(this.side);\n  @override\n  double area() => side * side;\n}",
    },
    {
        "title": "интерфейс",
        "text": "каждый класс в dart неявно задаёт интерфейс из своих публичных членов. implements обязывает реализовать его полностью, но реализацию не наследует. класс может реализовывать несколько интерфейсов сразу.",
        "code": "abstract class Speaker {\n  void speak();\n}\n\nclass Robot implements Speaker {\n  @override\n  void speak() => print('бип');\n}",
    },
    {
        "title": "миксин",
        "text": "миксин позволяет повторно использовать код в разных иерархиях без множественного наследования. миксины из with применяются слева направо, при совпадении имён действует последний. ограничение on задаёт, к каким классам миксин применим.",
        "code": "mixin Logger on Person {\n  void log() => print('[$name]');\n}\n\nclass Admin extends Person with Logger {\n  Admin(super.name, super.age);\n}",
    },
]


def build_slides() -> list[dict]:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    lectures = data["lectures"][20:38]
    slides = [
        {
            "kind": "title",
            "kicker": "dart",
            "title": "ооп",
            "note": "объектно-ориентированное программирование",
        },
        {
            "kind": "toc",
            "title": "темы",
            "items": [clean(l["title"]).lower() for l in lectures],
        },
        {"kind": "section", "num": "00", "title": "база"},
    ]
    for item in BASICS:
        slides.append({"kind": "basic", "num": "00", **item})
    for idx, lec in enumerate(lectures, start=1):
        title = clean(lec["title"]).lower()
        num = f"{idx:02}"
        slides.append({"kind": "section", "num": num, "title": title})
        heading = title
        pending: list[str] = []

        def pending_lines() -> int:
            return sum(len(wrap(p, 68)) + 1 for p in pending)

        def flush_text():
            if not pending:
                return
            text = "\n\n".join(pending)
            pending.clear()
            for chunk in chunk_text(text, max_lines=6, width=68):
                slides.append({"kind": "text", "num": num, "title": heading, "text": chunk})

        for block in parse_blocks(lec.get("body") or ""):
            if block["kind"] == "head":
                flush_text()
                heading = block["text"]
                continue
            if block["kind"] == "text":
                pending.append(block["text"])
                if pending_lines() >= 10:
                    flush_text()
                continue
            code_chunks = chunk_code(block["text"], max_lines=13)
            short_note = "\n\n".join(pending).strip()
            if short_note and pending_lines() <= 3 and len(code_chunks) == 1 and code_chunks[0].count("\n") <= 9:
                slides.append(
                    {
                        "kind": "mix",
                        "num": num,
                        "title": heading,
                        "text": short_note,
                        "code": code_chunks[0],
                    }
                )
                pending.clear()
            else:
                flush_text()
                for chunk in code_chunks:
                    slides.append({"kind": "code", "num": num, "title": heading, "code": chunk})
        flush_text()
    slides.append({"kind": "end", "title": "return 0;"})
    return slides


def _set_fill(shape, rgb):
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb
    shape.line.fill.background()


def _set_slide_bg(slide, rgb):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb


def add_run(p, text, size, color, bold=False, font=UI_NAME):
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.color.rgb = color
    r.font.bold = bold
    r.font.name = font
    return r


def add_text(slide, l, t, w, h, text, size, color, bold=False, font=UI_NAME):
    box = slide.shapes.add_textbox(l, t, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    add_run(p, text, size, color, bold, font)
    return box


def add_multiline(slide, l, t, w, h, text, size, color, font=UI_NAME, space=6):
    box = slide.shapes.add_textbox(l, t, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    first = True
    for line in text.split("\n"):
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(space)
        add_run(p, line if line else " ", size, color, False, font)
    return box


def add_code(slide, l, t, w, h, code):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    _set_fill(shape, CODE_BG)
    shape.line.color.rgb = LINE
    tf = shape.text_frame
    tf.word_wrap = False
    tf.margin_left = Inches(0.24)
    tf.margin_top = Inches(0.18)
    first = True
    real = is_code(code)
    for line in code.split("\n"):
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(1)
        if not line:
            add_run(p, " ", 12, FG, False, "Consolas")
        for text, color in highlight(line, real):
            add_run(p, text, 12, RGBColor.from_string(color[1:]), False, "Consolas")
    return shape


def build_pptx(slides):
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    blank = prs.slide_layouts[6]
    for s in slides:
        slide = prs.slides.add_slide(blank)
        _set_slide_bg(slide, BG)
        kind = s["kind"]
        if kind == "title":
            add_text(slide, Inches(0.9), Inches(2.3), Inches(11), Inches(0.4), s["kicker"], 16, MUTED)
            add_text(slide, Inches(0.9), Inches(2.8), Inches(11), Inches(1.1), s["title"], 64, FG, True)
            add_text(slide, Inches(0.9), Inches(4.2), Inches(11), Inches(0.5), s["note"], 18, MUTED)
        elif kind == "toc":
            add_text(slide, Inches(0.9), Inches(0.5), Inches(11), Inches(0.5), s["title"], 28, FG, True)
            left, right = s["items"][:9], s["items"][9:]
            add_multiline(
                slide,
                Inches(0.9),
                Inches(1.4),
                Inches(5.5),
                Inches(5.4),
                "\n".join(f"{i+1:02}  {t[:42]}" for i, t in enumerate(left)),
                15,
                FG,
                space=8,
            )
            add_multiline(
                slide,
                Inches(7.0),
                Inches(1.4),
                Inches(5.5),
                Inches(5.4),
                "\n".join(f"{i+10:02}  {t[:42]}" for i, t in enumerate(right)),
                15,
                FG,
                space=8,
            )
        elif kind == "section":
            add_text(slide, Inches(0.9), Inches(2.6), Inches(2), Inches(0.4), s["num"], 16, MUTED)
            add_text(slide, Inches(0.9), Inches(3.1), Inches(11.4), Inches(1.2), s["title"], 36, FG, True)
        elif kind == "text":
            add_text(slide, Inches(0.9), Inches(0.4), Inches(2), Inches(0.3), s["num"], 13, MUTED)
            add_text(slide, Inches(0.9), Inches(0.72), Inches(11.4), Inches(0.7), s["title"], 22, FG, True)
            add_multiline(slide, Inches(0.9), Inches(1.55), Inches(11.4), Inches(5.2), s["text"], 16, FG, space=6)
        elif kind == "basic":
            lines = wrap(s["text"], 62)
            add_text(slide, Inches(0.9), Inches(0.45), Inches(2), Inches(0.3), s["num"], 13, MUTED)
            add_text(slide, Inches(0.9), Inches(0.8), Inches(11.4), Inches(0.8), s["title"], 32, FG, True)
            add_multiline(slide, Inches(0.9), Inches(1.85), Inches(11.4), Inches(2.6), "\n".join(lines), 20, FG, space=4)
            top = 1.85 + len(lines) * 0.42 + 0.35
            n = s["code"].count("\n") + 1
            add_code(slide, Inches(0.9), Inches(top), Inches(7.5), Inches(n * 0.24 + 0.45), s["code"])
        elif kind == "code":
            add_text(slide, Inches(0.9), Inches(0.32), Inches(2), Inches(0.28), s["num"], 13, MUTED)
            add_text(slide, Inches(0.9), Inches(0.6), Inches(11.4), Inches(0.5), s["title"], 20, FG, True)
            add_code(slide, Inches(0.9), Inches(1.2), Inches(11.4), Inches(5.6), s["code"])
        elif kind == "mix":
            add_text(slide, Inches(0.9), Inches(0.28), Inches(2), Inches(0.26), s["num"], 13, MUTED)
            add_text(slide, Inches(0.9), Inches(0.52), Inches(11.4), Inches(0.4), s["title"], 18, FG, True)
            add_multiline(
                slide,
                Inches(0.9),
                Inches(1.0),
                Inches(11.4),
                Inches(1.35),
                "\n".join(wrap(s["text"].replace("\n\n", " "), 68)[:3]),
                15,
                FG,
                space=4,
            )
            add_code(slide, Inches(0.9), Inches(2.5), Inches(11.4), Inches(4.3), s["code"])
        elif kind == "end":
            add_text(slide, Inches(0.9), Inches(3.2), Inches(11.4), Inches(0.8), s["title"], 36, FG, True)
    prs.save(PPTX_PATH)


def build_pdf(slides):
    pdfmetrics.registerFont(TTFont("ui", FONT_UI))
    pdfmetrics.registerFont(TTFont("uib", FONT_UI_B))
    pdfmetrics.registerFont(TTFont("code", FONT_CODE))
    pw, ph = 960, 540
    c = canvas.Canvas(str(PDF_PATH), pagesize=(pw, ph))
    ml = 64

    def fill():
        c.setFillColor(PDF_BG)
        c.rect(0, 0, pw, ph, fill=1, stroke=0)

    def draw(x, y, text, size, color, font="ui"):
        c.setFillColor(color)
        c.setFont(font, size)
        c.drawString(x, y, text)

    def code_line(x, y, line, size, real=True):
        for text, color in highlight(line, real):
            c.setFillColor(HexColor(color))
            c.setFont("code", size)
            c.drawString(x, y, text)
            x += pdfmetrics.stringWidth(text, "code", size)

    for s in slides:
        fill()
        kind = s["kind"]
        if kind == "title":
            draw(ml, 290, s["kicker"], 16, PDF_MUTED)
            draw(ml, 230, s["title"], 56, PDF_FG, "uib")
            draw(ml, 180, s["note"], 16, PDF_MUTED)
        elif kind == "toc":
            draw(ml, ph - 56, s["title"], 24, PDF_FG, "uib")
            y = ph - 110
            for i, t in enumerate(s["items"][:9]):
                draw(ml, y - i * 36, f"{i+1:02}  {t}", 15, PDF_FG)
            for i, t in enumerate(s["items"][9:]):
                draw(500, y - i * 36, f"{i+10:02}  {t}", 15, PDF_FG)
        elif kind == "section":
            draw(ml, 270, s["num"], 14, PDF_MUTED)
            for i, line in enumerate(wrap(s["title"], 42)[:3]):
                draw(ml, 230 - i * 40, line, 32, PDF_FG, "uib")
        elif kind == "text":
            draw(ml, ph - 48, s["num"], 12, PDF_MUTED)
            ty = ph - 80
            for i, line in enumerate(wrap(s["title"], 52)[:2]):
                draw(ml, ty - i * 26, line, 20, PDF_FG, "uib")
            y = ph - 140
            for line in s["text"].split("\n"):
                if y < 48:
                    break
                draw(ml, y, line[:78], 15, PDF_FG)
                y -= 26
        elif kind == "basic":
            draw(ml, ph - 52, s["num"], 12, PDF_MUTED)
            draw(ml, ph - 100, s["title"], 30, PDF_FG, "uib")
            y = ph - 160
            for line in wrap(s["text"], 62):
                draw(ml, y, line, 19, PDF_FG)
                y -= 30
            code = s["code"].split("\n")
            box_h = len(code) * 18 + 28
            box_y = y - 12 - box_h
            c.setFillColor(PDF_CODE)
            c.setStrokeColor(PDF_LINE)
            c.rect(56, box_y, 560, box_h, fill=1, stroke=1)
            c.setFillColor(PDF_FG)
            c.setFont("code", 13)
            ty = box_y + box_h - 24
            for line in code:
                code_line(72, ty, line, 13)
                ty -= 18
        elif kind == "code":
            draw(ml, ph - 42, s["num"], 12, PDF_MUTED)
            draw(ml, ph - 70, wrap(s["title"], 56)[0], 16, PDF_FG, "uib")
            box_x, box_y, box_w, box_h = 56, 40, 848, 390
            c.setFillColor(PDF_CODE)
            c.setStrokeColor(PDF_LINE)
            c.rect(box_x, box_y, box_w, box_h, fill=1, stroke=1)
            c.setFillColor(PDF_FG)
            c.setFont("code", 11)
            ty = box_y + box_h - 22
            for line in s["code"].split("\n"):
                if ty < box_y + 16:
                    break
                code_line(box_x + 16, ty, line[:90], 11, is_code(s["code"]))
                ty -= 15
        elif kind == "mix":
            draw(ml, ph - 42, s["num"], 12, PDF_MUTED)
            draw(ml, ph - 68, wrap(s["title"], 56)[0], 16, PDF_FG, "uib")
            y = ph - 100
            for line in wrap(s["text"].replace("\n\n", " "), 68)[:3]:
                if y < 220:
                    break
                draw(ml, y, line, 14, PDF_FG)
                y -= 20
            box_x, box_y, box_w, box_h = 56, 40, 848, max(140, y - 56)
            c.setFillColor(PDF_CODE)
            c.setStrokeColor(PDF_LINE)
            c.rect(box_x, box_y, box_w, box_h, fill=1, stroke=1)
            c.setFillColor(PDF_FG)
            c.setFont("code", 11)
            ty = box_y + box_h - 20
            for line in s["code"].split("\n"):
                if ty < box_y + 14:
                    break
                code_line(box_x + 16, ty, line[:90], 11, is_code(s["code"]))
                ty -= 14
        elif kind == "end":
            draw(ml, 250, s["title"], 32, PDF_FG, "uib")
        c.showPage()
    c.save()


if __name__ == "__main__":
    slides = build_slides()
    print("slides", len(slides))
    build_pptx(slides)
    build_pdf(slides)
    print(PPTX_PATH)
    print(PDF_PATH)
