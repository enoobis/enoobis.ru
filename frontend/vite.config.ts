import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

const viteDir = dirname(fileURLToPath(import.meta.url));

function pdfJsPublicAssets() {
  const srcRoot = join(viteDir, "node_modules/pdfjs-dist");
  const destRoot = join(viteDir, "public/pdfjs");

  function sync() {
    mkdirSync(destRoot, { recursive: true });
    for (const dir of ["cmaps", "standard_fonts", "wasm"] as const) {
      const src = join(srcRoot, dir);
      const dest = join(destRoot, dir);
      if (existsSync(src)) cpSync(src, dest, { recursive: true });
    }
  }

  return {
    name: "pdfjs-public-assets",
    buildStart: sync,
    configureServer() {
      sync();
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // В dev бэкенд часто на :3000; если слушаете API на 80 - задайте VITE_API_PORT=80 в .env.development
  const apiPort = env.VITE_API_PORT || "3000";
  return {
    plugins: [vue(), pdfJsPublicAssets()],
    worker: {
      format: "es",
    },
    build: {
      target: "es2022",
      sourcemap: false,
      rollupOptions: {
        maxParallelFileOps: 2,
        output: {
          manualChunks(id) {
            const norm = id.replace(/\\/g, "/");
            if (!norm.includes("node_modules")) return;
            if (norm.includes("@lucide/vue")) return "lucide";
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
