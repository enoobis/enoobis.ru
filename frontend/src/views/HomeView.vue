<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="home">
    <p class="logo">enoobis</p>
    <nav class="home-nav">
      <RouterLink to="/microblogs" class="home-link">лента</RouterLink>
      <RouterLink to="/blogs" class="home-link">блоги</RouterLink>
      <RouterLink to="/login" class="home-link">вход</RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.home {
  max-width: 640px;
  margin: 0 auto;
  padding: 16vh 1rem 2rem;
  text-align: center;
}
.logo {
  margin: 0 0 1.5rem;
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  text-transform: lowercase;
  color: var(--text);
}
.home-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem 1.25rem;
}
.home-link {
  font-size: 1rem;
  color: var(--text);
  text-transform: lowercase;
}
@media (max-width: 640px) {
  .logo {
    font-size: 2.2rem;
  }
  .home {
    padding-top: 12vh;
  }
}
</style>
