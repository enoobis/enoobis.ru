<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();
</script>

<template>
  <div class="layout">
    <header class="nav">
      <RouterLink to="/">enoobis.ru</RouterLink>
      <RouterLink to="/blog">Блог</RouterLink>
      <RouterLink v-if="auth.token" to="/courses">Курсы</RouterLink>
      <RouterLink v-if="auth.token" to="/invites">Инвайты</RouterLink>
      <RouterLink v-if="auth.token && (auth.role === 'teacher' || auth.role === 'admin')" to="/blog/write">
        Написать в блог
      </RouterLink>
      <RouterLink v-if="auth.token && auth.role === 'admin'" to="/admin">Админ</RouterLink>
      <span class="nav-spacer" />
      <template v-if="auth.token">
        <RouterLink :to="`/u/${auth.nickname}`">Профиль</RouterLink>
        <button class="secondary" type="button" @click="auth.logout()">Выйти</button>
      </template>
      <template v-else>
        <RouterLink to="/login">Вход</RouterLink>
        <RouterLink to="/register">Регистрация</RouterLink>
      </template>
    </header>
    <RouterView />
  </div>
</template>
