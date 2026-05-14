import { ref } from "vue";

/** true между началом перехода маршрута и полным завершением (включая lazy-import чанка) */
export const routeNavPending = ref(false);
