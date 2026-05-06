type ToastType = "success" | "error" | "info";

export function toast(text: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { text, type } }));
}

export function toastError(err: unknown, fallback = "ошибка") {
  const text = err instanceof Error ? err.message : fallback;
  toast(text, "error");
}

export function toastSuccess(text: string) {
  toast(text, "success");
}
