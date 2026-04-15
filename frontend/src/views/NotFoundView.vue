<template>
  <section class="card not-found">
    <p class="muted">Ошибка навигации</p>
    <h1>404</h1>
    <p>Страница не найдена.</p>
    <RouterLink to="/blog" class="btn secondary">В блог</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<style scoped>
.not-found {
  max-width: 560px;
  margin: 8vh auto;
  text-align: center;
}

h1 {
  font-size: clamp(2.2rem, 5vw, 3.2rem);
}
</style>
