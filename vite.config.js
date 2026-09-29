import { defineConfig } from "vite";

export default defineConfig({
  root: "www",
  base: "./",
  publicDir: "public",
  worker: { format: "es" },
  ...(process.env.VITE_PREVIEW_ALLOWED_HOST ? { preview: { allowedHosts: [process.env.VITE_PREVIEW_ALLOWED_HOST] } } : {}),
  build: {
    outDir: "build",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false
  }
});
