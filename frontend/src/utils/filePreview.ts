export type FilePreviewKind = "pdf" | "image" | "video";

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
const VIDEO_EXT = [".mp4", ".webm", ".mov", ".m4v"];

export function filePreviewKind(mime: string, name: string): FilePreviewKind | null {
  const m = (mime || "").toLowerCase();
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (m.includes("pdf") || ext === ".pdf") return "pdf";
  if (m.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  if (m.startsWith("video/") || VIDEO_EXT.includes(ext)) return "video";
  return null;
}
