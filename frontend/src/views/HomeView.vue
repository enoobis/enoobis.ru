<script setup lang="ts">
import { RouterLink } from "vue-router";
import { SITE_TAGLINE } from "../config/site";
import HomeLogoMark from "../components/HomeLogoMark.vue";
import AppSiteFooter from "../components/AppSiteFooter.vue";
</script>

<template>
  <div class="home-shell">
    <section class="home">
      <div class="logo-spin-wrap" aria-hidden="true">
        <HomeLogoMark />
      </div>
      <h1 class="tag">{{ SITE_TAGLINE }}</h1>
      <RouterLink to="/login" class="cta">войти</RouterLink>
      <nav class="alt-nav">
        <RouterLink to="/microblogs" class="alt-link"><span>лента</span></RouterLink>
        <span class="alt-sep" aria-hidden="true">·</span>
        <RouterLink to="/blogs" class="alt-link"><span>блоги</span></RouterLink>
        <span class="alt-sep" aria-hidden="true">·</span>
        <RouterLink to="/register" class="alt-link"><span>регистрация</span></RouterLink>
      </nav>
    </section>
    <AppSiteFooter />
  </div>
</template>

<style scoped>
.home-shell {
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - 5.5rem);
  width: 100%;
}
.home {
  flex: 1;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem 1rem 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
}
.logo-spin-wrap {
  width: clamp(88px, 22vw, 132px);
  height: clamp(88px, 22vw, 132px);
  margin: 0 0 0.6rem;
  animation: home-logo-spin 14s linear infinite;
  transform-origin: center center;
}
@keyframes home-logo-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .logo-spin-wrap {
    animation: none;
  }
}
.tag {
  margin: 0 0 2.2rem;
  color: var(--muted);
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  font-weight: 500;
  line-height: 1.55;
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
    padding: 1rem 1rem 1.5rem;
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
