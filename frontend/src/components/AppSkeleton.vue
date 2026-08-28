<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number;
    variant?: "list" | "feed";
  }>(),
  { rows: 5, variant: "list" },
);
</script>

<template>
  <div class="skeleton" :class="`skeleton--${variant}`" aria-hidden="true">
    <div v-for="i in rows" :key="i" class="skeleton-row">
      <span v-if="variant === 'feed'" class="skel-block skeleton-avatar" />
      <div class="skeleton-lines">
        <span class="skel-block skeleton-line skeleton-line--head" />
        <span class="skel-block skeleton-line" />
        <span v-if="variant === 'feed'" class="skel-block skeleton-line skeleton-line--tail" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  display: grid;
}
.skeleton-row {
  display: grid;
  gap: 0.7rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--border);
}
.skeleton--feed .skeleton-row {
  grid-template-columns: 36px 1fr;
}
.skeleton-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--avatar-radius);
}
.skeleton-lines {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}
.skeleton-line {
  height: 0.7rem;
  border-radius: 4px;
}
.skeleton-line--head {
  width: 42%;
}
.skeleton-line--tail {
  width: 28%;
}
.skeleton-row:nth-child(even) .skeleton-line:not(.skeleton-line--head):not(.skeleton-line--tail) {
  width: 78%;
}
</style>
