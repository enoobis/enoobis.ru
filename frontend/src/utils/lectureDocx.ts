import { marked, type Token, type Tokens } from "marked";

/* гост: times new roman 14pt, интервал 1.5, абзац 1.25 см, поля 20/10/20/30 мм */
const FONT = "Times New Roman";
const SIZE = 28;
const LINE = 360;
const INDENT = 709;

function plain(tokens: Token[] | undefined, fallback = ""): string {
  if (!tokens?.length) return fallback;
  return tokens
    .map((t) => {
      const any = t as { tokens?: Token[]; text?: string; raw?: string };
      if (any.tokens?.length) return plain(any.tokens);
      return any.text ?? any.raw ?? "";
    })
    .join("");
}

export async function downloadLectureDocx(title: string, markdown: string) {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
  } = await import("docx");

  const body = (text: string, opts: { indent?: boolean; mono?: boolean } = {}) =>
    new Paragraph({
      alignment: opts.mono ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
      spacing: { line: LINE, after: 0 },
      indent: opts.indent === false ? undefined : { firstLine: INDENT },
      children: [
        new TextRun({
          text,
          font: opts.mono ? "Consolas" : FONT,
          size: opts.mono ? 22 : SIZE,
        }),
      ],
    });

  const heading = (text: string, level: number) =>
    new Paragraph({
      heading: level <= 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      alignment: AlignmentType.LEFT,
      spacing: { line: LINE, before: 240, after: 120 },
      indent: { firstLine: INDENT },
      children: [new TextRun({ text, font: FONT, size: SIZE, bold: true, color: "000000" })],
    });

  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: LINE, after: 240 },
      children: [new TextRun({ text: title, font: FONT, size: 32, bold: true })],
    }),
  ];

  const walk = (tokens: Token[]) => {
    for (const token of tokens) {
      switch (token.type) {
        case "heading":
          paragraphs.push(heading(plain(token.tokens, (token as Tokens.Heading).text), token.depth));
          break;
        case "paragraph":
        case "text":
          paragraphs.push(body(plain(token.tokens, (token as Tokens.Paragraph).text)));
          break;
        case "blockquote":
          walk((token as Tokens.Blockquote).tokens ?? []);
          break;
        case "list":
          for (const item of (token as Tokens.List).items) {
            const mark = (token as Tokens.List).ordered ? "" : "— ";
            paragraphs.push(body(`${mark}${plain(item.tokens, item.text)}`));
          }
          break;
        case "code":
          for (const line of (token as Tokens.Code).text.split("\n")) {
            paragraphs.push(body(line || " ", { mono: true, indent: false }));
          }
          break;
        case "table": {
          const t = token as Tokens.Table;
          paragraphs.push(body(t.header.map((c) => plain(c.tokens, c.text)).join(" | ")));
          for (const row of t.rows) {
            paragraphs.push(body(row.map((c) => plain(c.tokens, c.text)).join(" | ")));
          }
          break;
        }
        default:
          break;
      }
    }
  };

  walk(marked.lexer(markdown ?? ""));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 567, bottom: 1134, left: 1701 } },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "тема"}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
