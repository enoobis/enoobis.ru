<script setup lang="ts">
import PageHeader from "../components/PageHeader.vue";
</script>

<template>
  <section class="saved-hub page-shell">
    <PageHeader title="закладки" />
    <nav class="pick">
      <RouterLink to="/blogs?mode=bookmarks" class="pick-link">блоги</RouterLink>
      <RouterLink to="/microblogs/saved" class="pick-link">микроблоги</RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.saved-hub {
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}
.pick {
  display: flex;
  gap: 0.5rem;
  max-width: 20rem;
}
.pick-link {
  flex: 1;
  display: block;
  padding: 0.85rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  text-align: center;
  text-decoration: none;
  text-transform: lowercase;
  font-size: 0.92rem;
}
.pick-link:hover {
  background: var(--surface);
  border-color: var(--hover-border);
}
</style>
