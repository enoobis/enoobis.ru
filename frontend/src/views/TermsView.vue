<script setup lang="ts">
import {
  AGREEMENT_EN,
  AGREEMENT_RU,
  AGREEMENT_TITLE_EN,
  AGREEMENT_TITLE_RU,
} from "../content/userAgreement";
</script>

<template>
  <section class="terms page-shell">
    <h1>{{ AGREEMENT_TITLE_RU }}</h1>
    <article v-for="block in AGREEMENT_RU" :key="block.title" class="block">
      <h2>{{ block.title }}</h2>
      <p v-for="(p, i) in block.body" :key="i">{{ p }}</p>
    </article>

    <h2 class="lang">{{ AGREEMENT_TITLE_EN }}</h2>
    <article v-for="block in AGREEMENT_EN" :key="block.title" class="block">
      <h3>{{ block.title }}</h3>
      <p v-for="(p, i) in block.body" :key="i">{{ p }}</p>
    </article>

    <p class="dl">
      <a href="/user-agreement.docx" download>скачать</a>
    </p>
  </section>
</template>

<style scoped>
.terms {
  max-width: 40rem;
  margin: 0 auto;
  padding-bottom: var(--space-8);
}

h1 {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.028em;
  margin: 0 0 1.75rem;
  line-height: 1.15;
}

h2,
h3 {
  font-size: var(--text-md);
  font-weight: 600;
  margin: 0 0 0.5rem;
  letter-spacing: -0.01em;
}

.lang {
  margin-top: var(--space-8);
  color: var(--muted);
}

.block {
  display: grid;
  gap: 0.6rem;
  margin-bottom: var(--space-5);
}

.block p {
  margin: 0;
  color: var(--text);
  font-size: var(--text-md);
  line-height: 1.55;
}

.dl {
  margin: var(--space-6) 0 0;
}

.dl a {
  color: var(--muted);
  font-size: var(--text-sm);
}

.dl a:hover {
  color: var(--text);
}
</style>
