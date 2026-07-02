import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

GlobalWorkerOptions.workerPort = new PdfWorker();

const PDFJS_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

export function pdfDocumentInit(data: ArrayBuffer) {
  return {
    data,
    cMapUrl: `${PDFJS_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
    wasmUrl: `${PDFJS_BASE}wasm/`,
    useSystemFonts: true,
    enableXfa: true,
    useWorkerFetch: true,
  };
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument(pdfDocumentInit(data)).promise;
}

export async function pdfOptionalContentForDisplay(doc: PDFDocumentProxy) {
  try {
    const cfg = await doc.getOptionalContentConfig({ intent: "display" });
    for (const [id] of cfg) cfg.setVisibility(id, true);
    return cfg;
  } catch {
    return undefined;
  }
}

export { getDocument };
