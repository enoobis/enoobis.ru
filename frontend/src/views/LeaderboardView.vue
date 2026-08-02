<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import MotionStagger from "../components/MotionStagger.vue";
import MotionStaggerItem from "../components/MotionStaggerItem.vue";
import PageHeader from "../components/PageHeader.vue";
import { listLeaderboard, type LeaderboardEntry } from "../api/leaderboard";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const list = ref<LeaderboardEntry[]>([]);
const search = ref(typeof route.query.q === "string" ? route.query.q : "");
const err = ref("");
const loading = ref(false);

const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return list.value;
  return list.value.filter((u) => u.nickname.toLowerCase().includes(q));
});

const activeChips = computed(() => {
  if (!search.value.trim()) return [];
  return [
    {
      label: search.value.trim(),
      clear: () => {
        router.replace({ path: "/leaderboard" });
      },
    },
  ];
});

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

watch(
  () => route.query.q,
  (v) => {
    search.value = typeof v === "string" ? v : "";
  },
);

onMounted(load);
</script>

<template>
  <section class="board page-shell">
    <PageHeader title="лидерборд">
      <template #back>
        <button type="button" class="filter-icon-btn" aria-label="назад" @click="back">
          <AppIcon name="back" :size="18" />
        </button>
      </template>
    </PageHeader>

    <div v-if="activeChips.length" class="active-chips">
      <button
        v-for="(c, i) in activeChips"
        :key="i"
        class="active-chip"
        type="button"
        @click="c.clear"
      >
        {{ c.label }} ×
      </button>
    </div>

    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading" class="page-empty" />
    <p v-else-if="!list.length" class="page-empty muted">пусто</p>
    <p v-else-if="search.trim() && !visible.length" class="page-empty muted">ничего не найдено</p>
    <MotionStagger v-else :list-key="`${search.trim()}-${visible.length}`" class="list">
      <MotionStaggerItem
        v-for="u in visible"
        :key="u.id"
        class="row"
        :class="{ top: u.rank <= 3 }"
        :interactive="false"
      >
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
      </MotionStaggerItem>
    </MotionStagger>
  </section>
</template>

<style scoped>
.board :deep(.page-head) {
  margin-bottom: 1rem;
}
.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.75rem;
}
.active-chip {
  padding: 0.3rem 0.75rem;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.82rem;
}
.active-chip:hover {
  color: var(--text);
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
