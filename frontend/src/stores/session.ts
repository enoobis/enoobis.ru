import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/http";
import { chatsUnread } from "../api/chat";
import { rememberViewerPreferences } from "../utils/preferences";
import { useAuthStore } from "./auth";
import { useChatStore } from "./chat";

export type MePresentation = {
  theme_preference: string;
  language_preference: string;
  font_preference: string;
  avatar_url: string;
  coins: number;
};

let meInflight: Promise<void> | null = null;

const LS_SESSION_ME = "enoobis_session_me";

function readMeCache(): MePresentation | null {
  try {
    const raw = localStorage.getItem(LS_SESSION_ME);
    if (!raw) return null;
    const row = JSON.parse(raw) as MePresentation & { coins?: number };
    return {
      theme_preference: row.theme_preference ?? "black",
      language_preference: row.language_preference ?? "ru",
      font_preference: row.font_preference ?? "normal",
      avatar_url: row.avatar_url ?? "",
      coins: Math.max(0, Math.floor(Number(row.coins ?? 0))),
    };
  } catch {
    return null;
  }
}

function writeMeCache(row: MePresentation) {
  try {
    localStorage.setItem(LS_SESSION_ME, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

export const useSessionStore = defineStore("session", () => {
  const me = ref<MePresentation | null>(readMeCache());
  const meReady = ref(!!me.value);
  const avatarBroken = ref(false);
  const shellActive = ref(false);

  const avatarUrl = computed(() => me.value?.avatar_url ?? "");
  const coins = computed(() => me.value?.coins ?? 0);

  let activityTickStart = Date.now();
  let activityInterval: ReturnType<typeof setInterval> | null = null;
  let chatPollInterval: ReturnType<typeof setInterval> | null = null;

  function reset() {
    me.value = null;
    meReady.value = false;
    avatarBroken.value = false;
    meInflight = null;
    try {
      localStorage.removeItem(LS_SESSION_ME);
    } catch {
      /* ignore */
    }
    stopShell();
  }

  function setCoins(n: number) {
    if (me.value) {
      me.value.coins = Math.max(0, Math.floor(n));
      writeMeCache(me.value);
    }
  }

  async function ensureMe(force = false) {
    const auth = useAuthStore();
    if (!auth.token) {
      me.value = null;
      meReady.value = false;
      avatarBroken.value = false;
      return;
    }
    if (!force && meReady.value && me.value) return;
    if (!force && meInflight) {
      await meInflight;
      return;
    }
    const run = async () => {
      try {
        const row = await api<MePresentation & { coins?: number }>("/api/me", {
          token: auth.token,
        });
        me.value = {
          theme_preference: row.theme_preference,
          language_preference: row.language_preference,
          font_preference: row.font_preference,
          avatar_url: row.avatar_url || "",
          coins: Math.max(0, Math.floor(Number(row.coins ?? 0))),
        };
        writeMeCache(me.value);
        avatarBroken.value = false;
        rememberViewerPreferences(row);
      } catch {
        /* keep stale */
      } finally {
        meReady.value = true;
      }
    };
    meInflight = run();
    try {
      await meInflight;
    } finally {
      meInflight = null;
    }
  }

  async function onAvatarError() {
    await ensureMe(true);
    if (!me.value?.avatar_url) avatarBroken.value = true;
  }

  async function flushActivity(force = false, visible = !document.hidden) {
    const auth = useAuthStore();
    if (!auth.token || !shellActive.value) return;
    const now = Date.now();
    const elapsed = Math.floor((now - activityTickStart) / 1000);
    if (!force && elapsed < 10) return;
    if (!force && document.hidden) return;
    activityTickStart = now;
    const seconds = visible && elapsed > 0 ? Math.min(elapsed, 600) : 0;
    if (!visible && seconds <= 0 && !force) return;
    try {
      const data = await api<{ ok?: boolean; coins?: number }>("/api/me/activity", {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({ seconds, visible: !!visible }),
      });
      if (typeof data.coins === "number") setCoins(data.coins);
    } catch {
      /* ignore */
    }
  }

  async function clearOnlinePresence() {
    const auth = useAuthStore();
    if (!auth.token) return;
    try {
      await api("/api/me/activity", {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({ seconds: 0, visible: false }),
      });
    } catch {
      /* ignore */
    }
  }

  function stopActivityTracking() {
    if (activityInterval) {
      clearInterval(activityInterval);
      activityInterval = null;
    }
  }

  function stopChatPoll() {
    if (chatPollInterval) {
      clearInterval(chatPollInterval);
      chatPollInterval = null;
    }
  }

  function startActivityTracking() {
    stopActivityTracking();
    activityTickStart = Date.now();
    const auth = useAuthStore();
    if (!auth.token || !shellActive.value) return;
    void flushActivity(true, true);
    activityInterval = setInterval(() => {
      void flushActivity(false, !document.hidden);
    }, 30000);
  }

  function startChatPoll() {
    stopChatPoll();
    const auth = useAuthStore();
    const chat = useChatStore();
    if (!auth.token || !shellActive.value) return;
    void chat.refresh();
    chatPollInterval = setInterval(() => void chat.refresh(), 15000);
  }

  async function startShell() {
    if (shellActive.value) return;
    shellActive.value = true;
    await ensureMe();
    startActivityTracking();
    startChatPoll();
  }

  function stopShell() {
    shellActive.value = false;
    stopActivityTracking();
    stopChatPoll();
  }

  function onVisibilityChange() {
    if (!shellActive.value) return;
    if (document.hidden) {
      void flushActivity(true, false);
    } else {
      activityTickStart = Date.now();
      void flushActivity(true, true);
    }
  }

  return {
    me,
    meReady,
    avatarBroken,
    avatarUrl,
    coins,
    shellActive,
    ensureMe,
    setCoins,
    onAvatarError,
    startShell,
    stopShell,
    flushActivity,
    clearOnlinePresence,
    onVisibilityChange,
    reset,
  };
});
