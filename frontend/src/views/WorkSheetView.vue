<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getWorkSheet, workSheetExportUrl, type WorkSheet } from "../api/work";
import AppLoading from "../components/AppLoading.vue";
import PageHeader from "../components/PageHeader.vue";

const route = useRoute();
const sheet = ref<WorkSheet | null>(null);
const err = ref("");
const loading = ref(true);
const wrapEl = ref<HTMLElement | null>(null);

const token = () => String(route.params.token ?? "");

const view = computed(() => {
  const s = sheet.value;
  if (!s) return null;
  const days = [...s.days].reverse();
  const rows = s.rows.map((row) => ({
    ...row,
    marks: [...row.marks].reverse(),
  }));
  return { days, rows };
});

function fmtDay(iso: string) {
  const [, m, d] = iso.split("-");
  return m && d ? `${d}.${m}` : iso;
}

onMounted(async () => {
  try {
    sheet.value = await getWorkSheet(token());
    await nextTick();
    if (wrapEl.value) wrapEl.value.scrollLeft = 0;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="page-shell sheet">
    <PageHeader title="отметки">
      <template #actions>
        <a
          v-if="sheet"
          class="xl"
          :href="workSheetExportUrl(token())"
          download="checkins.xlsx"
        >
          excel
        </a>
      </template>
    </PageHeader>
    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading" />
    <p v-else-if="!view?.rows.length" class="page-empty muted">пусто</p>
    <div v-else ref="wrapEl" class="wrap">
      <table>
        <thead>
          <tr>
            <th class="who">кто</th>
            <th
              v-for="(d, i) in view.days"
              :key="d.date"
              :class="{ today: i === 0 }"
            >
              {{ fmtDay(d.date) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in view.rows" :key="row.nickname">
            <td class="who">
              <span class="nick">{{ row.nickname }}</span>
              <span v-if="row.name" class="name">{{ row.name }}</span>
            </td>
            <td
              v-for="(m, i) in row.marks"
              :key="view.days[i].date"
              :class="{ today: i === 0, on: m === '1' }"
            >
              {{ m === "1" ? "1" : "·" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.sheet {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}
.xl {
  font-size: var(--text-sm);
  color: var(--muted);
}
.wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  margin-inline: calc(-1 * var(--space-4, 1rem));
  padding-inline: var(--space-4, 1rem);
}
table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
th,
td {
  padding: 0.55rem 0.4rem;
  border-bottom: 1px solid var(--border);
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
th {
  font-weight: 500;
  color: var(--muted);
  font-size: var(--text-2xs);
}
th.who,
td.who {
  text-align: left;
  padding-inline: 0.55rem 0.75rem;
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--bg);
  min-width: 7.5rem;
  max-width: 9.5rem;
}
.nick {
  display: block;
  color: var(--text);
}
.name {
  display: block;
  font-size: var(--text-2xs);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
td.on {
  color: var(--text);
  font-weight: 600;
}
td:not(.who):not(.on) {
  color: var(--muted);
}
th.today,
td.today {
  background: color-mix(in srgb, var(--text) 6%, var(--bg));
}
th.today {
  color: var(--text);
}

@media (max-width: 640px) {
  .wrap {
    margin-inline: calc(-1 * var(--space-3, 0.75rem));
    padding-inline: var(--space-3, 0.75rem);
  }
  table {
    font-size: var(--text-xs);
  }
  th,
  td {
    padding: 0.5rem 0.28rem;
  }
  th.who,
  td.who {
    min-width: 5.75rem;
    max-width: 7rem;
    padding-inline: 0.35rem 0.5rem;
  }
}
</style>
