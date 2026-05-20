<template>
  <section class="saved-hub">
    <h1>закладки</h1>
    <nav class="pick">
      <RouterLink to="/blogs?mode=bookmarks" class="pick-link">блоги</RouterLink>
      <RouterLink to="/microblogs/saved" class="pick-link">микроблоги</RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.saved-hub {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 20rem;
  width: 100%;
  margin: 0 auto;
  padding-top: 2.5rem;
  text-align: center;
}
.saved-hub h1 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  font-weight: 500;
}
.pick {
  display: flex;
  gap: 0.5rem;
  width: 100%;
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
