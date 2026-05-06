<template>
  <section class="home">
    <div class="logo">enoobis</div>
  </section>
</template>

<style scoped>
.home {
  max-width: 640px;
  margin: 0 auto;
}
.logo {
  text-align: center;
  font-size: 3rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  text-transform: lowercase;
  padding: 18vh 0;
  color: var(--text);
}
@media (max-width: 640px) {
  .logo {
    font-size: 2.2rem;
    padding: 14vh 0;
  }
}
</style>
