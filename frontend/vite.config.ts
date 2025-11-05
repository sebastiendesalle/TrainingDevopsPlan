import { defineConfig } from "vite";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // This is your homepage
        main: resolve(__dirname, "index.html"),

        // This is your training log page
        log: resolve(__dirname, "log.html"),
      },
    },
  },
});
