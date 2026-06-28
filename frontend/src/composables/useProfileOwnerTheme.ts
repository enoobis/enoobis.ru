import { type WatchSource, watch } from "vue";
import { api } from "../api/http";
import { useAuthStore } from "../stores/auth";
import { applyProfileOwnerTheme } from "../utils/preferences";

export function useProfileOwnerThemeFromValue(theme: WatchSource<string | undefined>) {
  watch(
    theme,
    (value) => {
      if (value !== undefined) applyProfileOwnerTheme(value);
    },
    { immediate: true },
  );
}

export function useProfileOwnerThemeFromApi(nickname: WatchSource<string>) {
  const auth = useAuthStore();
  watch(
    nickname,
    async (nick) => {
      if (!nick) return;
      try {
        const p = await api<{ theme_preference?: string }>(
          `/api/profile/${encodeURIComponent(nick)}`,
          { token: auth.token },
        );
        applyProfileOwnerTheme(p.theme_preference);
      } catch {
        // профиль недоступен - оставляем текущую тему
      }
    },
    { immediate: true },
  );
}
