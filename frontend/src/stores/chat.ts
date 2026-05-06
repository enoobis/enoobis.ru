import { defineStore } from "pinia";
import { ref } from "vue";
import { chatsUnread } from "../api/chat";
import { useAuthStore } from "./auth";

export const useChatStore = defineStore("chat", () => {
  const unread = ref(0);

  async function refresh() {
    const auth = useAuthStore();
    if (!auth.token) {
      unread.value = 0;
      return;
    }
    try {
      const r = await chatsUnread(auth.token);
      unread.value = r.unread;
    } catch {
      /* ignore */
    }
  }

  function reset() {
    unread.value = 0;
  }

  return { unread, refresh, reset };
});
