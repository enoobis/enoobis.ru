<script setup lang="ts">
import SearchPanel from "../components/SearchPanel.vue";
</script>

<template>
  <section class="search-view">
    <SearchPanel autofocus />
  </section>
</template>

<style scoped>
.search-view {
  max-width: 640px;
  margin: 0 auto;
}
</style>
