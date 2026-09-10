<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getWorkSheet, workSheetExportUrl, type WorkSheet } from "../api/work";
import AppLoading from "../components/AppLoading.vue";
import PageHeader from "../components/PageHeader.vue";

const route = useRoute();
const sheet = ref<WorkSheet | null>(null);
const err = ref("");
const loading = ref(true);

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

function mark(m: string) {
  return m === "1" ? "1" : "·";
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
          excel
        </a>
      </template>
    </PageHeader>
    <p v-if="err" class="error">{{ err }}</p>
    <AppLoading v-else-if="loading" />
    <p v-else-if="!view?.rows.length" class="page-empty muted">пусто</p>
    <template v-else>
      <ul class="people">
        <li v-for="row in view.rows" :key="row.nickname">
          <div class="who">
            <span class="nick">{{ row.nickname }}</span>
            <span v-if="row.name" class="muted">{{ row.name }}</span>
          </div>
          <ol class="days">
            <li v-for="(m, i) in row.marks" :key="view.days[i].date" :class="{ today: i === 0, on: m === '1' }">
              <span class="n muted">{{ fmtDay(view.days[i].date) }}</span>
              <span class="m">{{ mark(m) }}</span>
            </li>
          </ol>
        </li>
      </ul>
      <div class="wrap">
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
                {{ mark(m) }}
              </td>
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
  min-width: 0;
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
.people .who {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.7rem;
  margin-bottom: var(--space-3);
}
.people .nick {
  font-weight: 500;
}
.days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.6rem, 1fr));
  gap: 0.15rem 0;
}
.days li {
  display: grid;
  justify-items: center;
  gap: 0.05rem;
  padding: 0.2rem 0;
}
.days .n {
  font-size: var(--text-2xs);
  line-height: 1;
}
.days .m {
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  min-height: 1.2em;
  color: var(--muted);
}
.days li.on .m {
  color: var(--text);
  font-weight: 600;
}
.days li.today {
  background: color-mix(in srgb, var(--text) 6%, var(--bg));
  border-radius: 6px;
}
.wrap {
  display: none;
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
td.who .nick {
  display: block;
  color: var(--text);
  font-weight: 500;
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

@media (min-width: 761px) {
  .people {
    display: none;
  }
  .wrap {
    display: block;
  }
}
</style>
