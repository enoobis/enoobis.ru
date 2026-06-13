import fs from "node:fs";
import { contentDispositionInline } from "./contentDisposition.js";

/** @param {import("express").Response} res */
export function prepareMediaResponse(res) {
  res.removeHeader("Content-Security-Policy");
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {string} abs
 * @param {string} mime
 * @param {string} originalName
 */
export function streamFileInline(req, res, abs, mime, originalName) {
  const stat = fs.statSync(abs);
  const size = stat.size;
  const disposition = contentDispositionInline(originalName);

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d+)-(\d*)$/i.exec(String(range).trim());
    if (m) {
      const start = Number(m[1]);
      let end = m[2] ? Number(m[2]) : size - 1;
      if (!Number.isFinite(start) || start < 0 || start >= size) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`);
        return res.end();
      }
      if (!Number.isFinite(end) || end >= size) end = size - 1;
      if (end < start) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`);
        return res.end();
      }
      prepareMediaResponse(res);
      res.status(206);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", disposition);
      fs.createReadStream(abs, { start, end })
        .on("error", () => {
          if (!res.headersSent) res.sendStatus(500);
        })
        .pipe(res);
      return;
    }
  }

  prepareMediaResponse(res);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", String(size));
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", disposition);
  fs.createReadStream(abs)
    .on("error", () => {
      if (!res.headersSent) res.sendStatus(500);
    })
    .pipe(res);
}
