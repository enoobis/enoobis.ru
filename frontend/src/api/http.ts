const base = "";

function looksLikeHtml(text: string) {
  const t = text.trimStart().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html");
}

function backendUnavailableMessage() {
  return "API backend недоступен: вместо JSON пришла HTML-страница. Проверь, что backend запущен и /api маршруты доступны.";
}

export async function api<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const { token: _t, ...rest } = opts;
  const res = await fetch(`${base}${path}`, { ...rest, headers });
  const text = await res.text();

  if (looksLikeHtml(text)) {
    throw new Error(backendUnavailableMessage());
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? res.statusText;
    throw new Error(err);
  }
  return data as T;
}
