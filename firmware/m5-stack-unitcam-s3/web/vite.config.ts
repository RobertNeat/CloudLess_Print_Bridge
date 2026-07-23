import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import viteCompression from "vite-plugin-compression";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile(), viteCompression()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path
          .replace(/^\/api\/v1\/camera\/runtime/, "/camera_runtime")
          .replace(/^\/api\/v1/, ""),
      },
    },
  },
});
