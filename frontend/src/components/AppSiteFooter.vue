<script setup lang="ts">
import { computed } from "vue";
import { SITE_SOCIAL, SITE_WATERED_AT } from "../config/site";
import { formatSiteDate, lastBackupDateLabel } from "../utils/siteDates";

const wateredLabel = computed(() => formatSiteDate(SITE_WATERED_AT));
const backupLabel = computed(() => lastBackupDateLabel());

const links = computed(() =>
  [
    { href: SITE_SOCIAL.github, label: "github" },
    { href: SITE_SOCIAL.linkedin, label: "linkedin" },
    { href: SITE_SOCIAL.discord, label: "discord community" },
  ].filter((l) => l.href.trim().length > 0),
);
</script>

<template>
  <div class="site-end" data-nosnippet>
    <p class="site-end-line muted small">last backup · {{ backupLabel }}</p>
    <footer class="site-foot">
      <p class="site-foot-line muted small">last watered {{ wateredLabel }}</p>
      <nav v-if="links.length" class="site-foot-links" aria-label="соцсети">
        <template v-for="(link, i) in links" :key="link.href">
          <span v-if="i > 0" class="site-foot-sep" aria-hidden="true">·</span>
          <a
            :href="link.href"
            class="site-foot-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ link.label }}
          </a>
        </template>
      </nav>
    </footer>
  </div>
</template>

<style scoped>
.site-end {
  margin-top: auto;
  padding: 1.25rem 0 1.5rem;
  text-align: center;
  display: grid;
  gap: 0.85rem;
}

.site-end-line {
  margin: 0;
  letter-spacing: 0.01em;
}

.site-foot {
  display: grid;
  gap: 0.55rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}

.site-foot-line {
  margin: 0;
}

.site-foot-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
}

.site-foot-link {
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: lowercase;
  border-bottom: none;
}

.site-foot-link:hover {
  color: var(--text);
  text-decoration: none;
}

.site-foot-sep {
  color: var(--muted);
  opacity: 0.45;
  pointer-events: none;
}
</style>
