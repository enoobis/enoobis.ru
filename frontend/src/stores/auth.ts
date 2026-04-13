import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/http";

const LS = "edu_token";
const LS_USER = "edu_user";

type User = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
};

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem(LS));

  function loadUser(): User | null {
    const raw = localStorage.getItem(LS_USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
  const user = ref<User | null>(loadUser());

  function persist(u: User | null, t: string | null) {
    if (t) localStorage.setItem(LS, t);
    else localStorage.removeItem(LS);
    if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
    else localStorage.removeItem(LS_USER);
  }

  const nickname = computed(() => user.value?.nickname ?? "");
  const role = computed(() => user.value?.role ?? "");

  async function login(email: string, password: string) {
    const r = await api<{ token: string; user: User }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    token.value = r.token;
    user.value = r.user;
    persist(r.user, r.token);
  }

  async function register(payload: {
    email: string;
    password: string;
    nickname: string;
    role?: string;
    invite_code?: string;
  }) {
    return api<{
      pending: boolean;
      token?: string;
      user?: User;
      message?: string;
    }>("/api/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  function applySession(t: string, u: User) {
    token.value = t;
    user.value = u;
    persist(u, t);
  }

  function logout() {
    token.value = null;
    user.value = null;
    persist(null, null);
  }

  return { token, user, nickname, role, login, register, applySession, logout };
});
