<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import { useAuthStore } from "../stores/auth";

const AdminView = defineAsyncComponent(() => import("./AdminView.vue"));
const NotFoundView = defineAsyncComponent(() => import("./NotFoundView.vue"));

const auth = useAuthStore();
const allowed = computed(() => Boolean(auth.token && auth.isPanelStaff));
</script>

<template>
  <AdminView v-if="allowed" />
  <NotFoundView v-else />
</template>
