import { defineConfig } from "vite";
export default defineConfig({
  worker: {
    format: "es",
  },
  base: "vibe-icon",
  build: {
    minify: false,
    sourcemap: true,
  },
});
