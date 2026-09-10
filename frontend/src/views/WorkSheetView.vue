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
    <template v-else>
      <ul class="people">
        <li v-for="row in sheet.rows" :key="row.nickname">
          <div class="who">
            <span class="nick">{{ row.nickname }}</span>
            <span v-if="row.name" class="muted">{{ row.name }}</span>
          </div>
          <ol class="days">
            <li v-for="(m, i) in row.marks" :key="sheet.days[i].n">
              <span class="n muted">{{ sheet.days[i].n }}</span>
              <span class="m">{{ m }}</span>
            </li>
          </ol>
        </li>
      </ul>
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th>usernames</th>
              <th>name</th>
              <th v-for="d in sheet.days" :key="d.n">{{ d.n }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sheet.rows" :key="row.nickname">
              <td>{{ row.nickname }}</td>
              <td>{{ row.name }}</td>
              <td v-for="(m, i) in row.marks" :key="sheet.days[i].n">{{ m }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
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
.people {
  list-style: none;
  margin: 0;
  padding: 0;
}
.people > li {
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
}
.people > li:last-child {
  border-bottom: none;
}
.who {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.7rem;
  margin-bottom: var(--space-3);
}
.nick {
  font-weight: 500;
}
.days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.1rem, 1fr));
  gap: 0.15rem 0;
}
.days li {
  display: grid;
  justify-items: center;
  gap: 0.05rem;
  padding: 0.2rem 0;
}
.n {
  font-size: var(--text-2xs);
  line-height: 1;
}
.m {
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  min-height: 1.2em;
}
.wrap {
  display: none;
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
@media (min-width: 761px) {
  .people {
    display: none;
  }
  .wrap {
    display: block;
  }
}
</style>
