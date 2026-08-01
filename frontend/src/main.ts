import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import { bootstrapStoredViewerPreferences } from "./utils/preferences";
import { applyDocumentSeo } from "./utils/seo";
import { syncLiteMotion } from "./utils/reducedMotion";
import { setUnauthorizedHandler } from "./api/http";
import { useAuthStore } from "./stores/auth";

bootstrapStoredViewerPreferences();
syncLiteMotion();

const app = createApp(App);
app.use(createPinia());
app.use(router);

setUnauthorizedHandler(() => {
  const auth = useAuthStore();
  if (!auth.token) return;
  const current = router.currentRoute.value;
  auth.logout();
  if (current.meta.panel || current.name === "panel") {
    void router.replace({ path: current.path });
    return;
  }
  if (current.name !== "login") {
    void router.replace({ name: "login" });
  }
});

applyDocumentSeo();
app.mount("#app");
