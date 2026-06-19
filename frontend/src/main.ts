import { createApp } from "vue";
import { createPinia } from "pinia";
import { MotionPlugin } from "@vueuse/motion";
import { autoAnimatePlugin } from "@formkit/auto-animate/vue";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import { bootstrapStoredViewerPreferences } from "./utils/preferences";
import { applyDocumentSeo } from "./utils/seo";
import { installRipple } from "./utils/ripple";
import { setUnauthorizedHandler } from "./api/http";
import { useAuthStore } from "./stores/auth";

bootstrapStoredViewerPreferences();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(MotionPlugin);
app.use(autoAnimatePlugin);

setUnauthorizedHandler(() => {
  const auth = useAuthStore();
  if (!auth.token) return;
  auth.logout();
  if (router.currentRoute.value.name !== "login") {
    void router.replace({
      name: "login",
      query: { next: router.currentRoute.value.fullPath },
    });
  }
});

applyDocumentSeo();
installRipple();
app.mount("#app");
