<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="nf">
    <h1>404</h1>
    <p class="muted">не найдено</p>
    <RouterLink to="/" class="muted">на главную →</RouterLink>
  </section>
</template>

<style scoped>
.nf {
  max-width: 320px;
  margin: 16vh auto 0;
  text-align: center;
  display: grid;
  gap: 0.5rem;
}
h1 {
  font-size: 2.4rem;
  font-weight: 600;
  margin: 0;
}
</style>
