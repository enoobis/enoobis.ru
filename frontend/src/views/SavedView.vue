<script setup lang="ts">
import PageHeader from "../components/PageHeader.vue";
</script>

<template>
  <section class="saved-hub page-shell">
    <PageHeader title="закладки" />
    <nav class="content-tabs">
      <RouterLink to="/blogs?mode=bookmarks" class="content-tab">блоги</RouterLink>
      <RouterLink to="/microblogs/saved" class="content-tab">микроблоги</RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.saved-hub {
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  display: grid;
  gap: 0.6rem;
}
</style>
