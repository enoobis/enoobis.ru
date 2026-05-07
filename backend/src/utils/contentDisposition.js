function asciiFallback(name) {
  const s = String(name || "file").replace(/\r|\n/g, "");
  const ascii = s
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .trim();
  return (ascii || "file").slice(0, 180);
}

function utf8StarParam(name) {
  const s = String(name || "file").replace(/\r|\n/g, "");
  return encodeURIComponent(s).replace(/['()]/g, (c) => encodeURIComponent(c));
}

export function contentDispositionAttachment(originalName) {
  const ascii = asciiFallback(originalName);
  const star = utf8StarParam(originalName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${star}`;
}

export function contentDispositionInline(originalName) {
  const ascii = asciiFallback(originalName);
  const star = utf8StarParam(originalName);
  return `inline; filename="${ascii}"; filename*=UTF-8''${star}`;
}
