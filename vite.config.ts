import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleApiRequest, startAutoSync } from "./server/api-handler.mjs";

function localApiPlugin() {
  return {
    name: "agentusecases-local-api",
    configureServer(server) {
      startAutoSync();
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith("/api/")) {
          handleApiRequest(req, res, next);
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      startAutoSync();
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith("/api/")) {
          handleApiRequest(req, res, next);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApiPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
