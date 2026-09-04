<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getWorkSheet, workSheetExportUrl, type WorkSheet } from "../api/work";
import AppLoading from "../components/AppLoading.vue";
import PageHeader from "../components/PageHeader.vue";

const route = useRoute();
const sheet = ref<WorkSheet | null>(null);
const err = ref("");
const loading = ref(true);

const token = () => String(route.params.token ?? "");

function fmtDay(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

onMounted(async () => {
  try {
    sheet.value = await getWorkSheet(token());
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
          скачать excel
        </a>
      </template>
    </PageHeader>
    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading" />
    <p v-else-if="!sheet?.rows.length" class="page-empty muted">пусто</p>
    <div v-else class="wrap">
      <table>
        <thead>
          <tr>
            <th>usernames</th>
            <th>name</th>
            <th v-for="d in sheet.days" :key="d.date">{{ fmtDay(d.date) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sheet.rows" :key="row.nickname">
            <td>{{ row.nickname }}</td>
            <td>{{ row.name }}</td>
            <td v-for="(m, i) in row.marks" :key="sheet.days[i].date">{{ m }}</td>
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
}
.xl {
  font-size: var(--text-sm);
  color: var(--muted);
}
.wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
th,
td {
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}
th {
  font-weight: 500;
  color: var(--muted);
}
td:nth-child(n + 3),
th:nth-child(n + 3) {
  text-align: center;
  font-variant-numeric: tabular-nums;
}
th:first-child,
td:first-child,
th:nth-child(2),
td:nth-child(2) {
  position: sticky;
  background: var(--bg);
}
th:first-child,
td:first-child {
  left: 0;
  z-index: 1;
}
th:nth-child(2),
td:nth-child(2) {
  left: 8.5rem;
  z-index: 1;
}
</style>
