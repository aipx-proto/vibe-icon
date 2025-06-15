import { defineConfig } from "vite";
export default defineConfig({
  worker: {
    format: "es",
  },
  base: "",
  build: {
    minify: false,
    sourcemap: true,
  },
});
