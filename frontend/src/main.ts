import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import { bootstrapStoredViewerPreferences } from "./utils/preferences";
import { applyDocumentSeo } from "./utils/seo";
import { installRipple } from "./utils/ripple";

bootstrapStoredViewerPreferences();

const app = createApp(App);
app.use(createPinia());
app.use(router);
applyDocumentSeo();
installRipple();
app.mount("#app");
