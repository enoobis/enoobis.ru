export async function uploadAvatar(
  token: string,
  file: File,
): Promise<{ avatar_url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/me/avatar", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
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
  return data as { avatar_url: string };
}
