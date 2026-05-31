<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import { listLeaderboard, type LeaderboardEntry } from "../api/leaderboard";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const list = ref<LeaderboardEntry[]>([]);
const err = ref("");
const loading = ref(false);

async function load() {
  if (!auth.token) return;
  err.value = "";
  loading.value = true;
  try {
    list.value = await listLeaderboard(auth.token);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
}

function back() {
  if (window.history.state?.back) router.back();
  else router.push("/blogs");
}

onMounted(load);
</script>

<template>
  <section class="board page-shell">
    <header class="head">
      <button type="button" class="back" aria-label="назад" @click="back">
        <AppIcon name="back" :size="18" />
      </button>
      <h1>лидерборд</h1>
    </header>

    <p v-if="err" class="error">{{ err }}</p>
    <p v-else-if="loading" class="muted">загрузка</p>
    <p v-else-if="!list.length" class="muted">пусто</p>
    <ol v-else class="list">
      <li v-for="u in list" :key="u.id" class="row" :class="{ top: u.rank <= 3 }">
        <span class="rank">{{ u.rank }}</span>
        <RouterLink :to="`/u/${u.nickname}`" class="user">
          <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
          <span v-else class="ava">{{ u.nickname.slice(0, 2) }}</span>
          <span>@{{ u.nickname }}</span>
        </RouterLink>
        <span class="coins">
          <img src="/coin-gem.png" alt="" width="16" height="16" loading="lazy" />
          {{ u.coins }}
        </span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.board {
  max-width: 640px;
  margin: 0 auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1rem;
}
.back {
  width: 32px;
  height: 32px;
  min-height: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
}
h1 {
  font-size: 1.1rem;
  font-weight: 600;
  text-transform: lowercase;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--border);
}
.row.top .rank {
  font-weight: 600;
}
.rank {
  width: 1.6rem;
  flex-shrink: 0;
  text-align: center;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.user {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex: 1;
  min-width: 0;
  color: var(--text);
  text-transform: lowercase;
}
.user img,
.ava {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  flex-shrink: 0;
  object-fit: cover;
}
.ava {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface2);
  font-size: 0.75rem;
  color: var(--muted);
}
.coins {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
</style>
