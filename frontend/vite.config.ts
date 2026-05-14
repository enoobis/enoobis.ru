import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // В dev бэкенд часто на :3000; если слушаете API на 80 — задайте VITE_API_PORT=80 в .env.development
  const apiPort = env.VITE_API_PORT || "3000";
  return {
    plugins: [vue()],
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks(id) {
            const norm = id.replace(/\\/g, "/");
            if (!norm.includes("node_modules")) return;
            if (
              norm.includes("marked") ||
              norm.includes("dompurify") ||
              norm.includes("highlight.js")
            ) {
              return "md";
            }
            if (
              norm.includes("node_modules/vue/") ||
              norm.includes("node_modules/vue-router") ||
              norm.includes("node_modules/pinia")
            ) {
              return "vue-vendor";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
        // Аватары отдаются с бэкенда; без этого <img src="/uploads/..."> на :5173 даёт 404
        "/uploads": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
