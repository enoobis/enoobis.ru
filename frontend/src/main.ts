import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import { applyDocumentSeo } from "./utils/seo";

const app = createApp(App);
app.use(createPinia());
app.use(router);
applyDocumentSeo();
app.mount("#app");
