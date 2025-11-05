import { defineConfig } from "vite";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // homepage
        main: resolve(__dirname, "index.html"),

        // training log page
        log: resolve(__dirname, "log.html"),

        // calendar
        calendar: resolve(__dirname, "calendar.html"),
      },
    },
  },
});
