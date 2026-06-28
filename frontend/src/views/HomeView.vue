<script setup lang="ts">
import { RouterLink } from "vue-router";
import { SITE_TAGLINE } from "../config/site";
</script>

<template>
  <section class="home" data-reveal>
    <img
      src="/logo-mark.png"
      alt="enoobis"
      class="logo"
      width="132"
      height="132"
      decoding="async"
      fetchpriority="high"
    />
    <p class="tag">{{ SITE_TAGLINE }}</p>
    <RouterLink to="/login" class="cta">войти</RouterLink>
    <nav class="alt-nav">
      <RouterLink to="/microblogs" class="alt-link"><span>лента</span></RouterLink>
      <span class="alt-sep" aria-hidden="true">·</span>
      <RouterLink to="/blogs" class="alt-link"><span>блоги</span></RouterLink>
      <span class="alt-sep" aria-hidden="true">·</span>
      <RouterLink to="/register" class="alt-link"><span>регистрация</span></RouterLink>
    </nav>
  </section>
</template>

<style scoped>
.home {
  max-width: 640px;
  margin: 0 auto;
  padding: 18vh 1rem 4rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.logo {
  margin: 0 0 0.6rem;
  width: clamp(88px, 22vw, 132px);
  height: clamp(88px, 22vw, 132px);
  display: block;
  border-radius: 16px;
  object-fit: contain;
  animation: home-logo-spin 14s linear infinite;
  transform-origin: center center;
}
@keyframes home-logo-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .logo {
    animation: none;
  }
}
.tag {
  margin: 0 0 2.2rem;
  color: var(--muted);
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  font-weight: 500;
}
.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0.85rem 2rem;
  border-radius: var(--radius-pill);
  background: var(--text);
  color: var(--bg);
  font-weight: 700;
  font-size: 1.05rem;
  text-transform: lowercase;
  border: 1px solid var(--text);
  transition:
    transform var(--dur-2) var(--ease-spring),
    opacity var(--dur-2) var(--ease-out);
  margin-bottom: 1.6rem;
}
.cta:hover {
  border-bottom-color: transparent;
  transform: translateY(-2px);
  opacity: 0.92;
}
.cta:active {
  transform: translateY(0) scale(0.97);
}
.alt-nav {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem 0.8rem;
  font-size: 0.95rem;
}
.alt-link {
  position: relative;
  color: var(--muted);
  text-transform: lowercase;
  border-bottom: none;
  padding: 0.3rem 0;
}
.alt-link span {
  position: relative;
  display: inline-block;
}
.alt-link span::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 1.5px;
  background: var(--text);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--dur-3) var(--ease-snap);
}
.alt-link:hover {
  color: var(--text);
}
.alt-link:hover span::after {
  transform: scaleX(1);
}
.alt-sep {
  color: var(--muted);
  opacity: 0.4;
}
@media (max-width: 640px) {
  .home {
    padding-top: 14vh;
  }
  .tag {
    margin-bottom: 1.8rem;
  }
  .cta {
    width: 100%;
    max-width: 280px;
    min-height: 48px;
  }
}
</style>
