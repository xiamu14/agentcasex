import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { handleApiRequest, startAutoSync } from "./api-handler.mjs";

const PORT = Number(process.env.PORT || 5173);
const DIST_DIR = path.resolve(process.cwd(), "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  handleApiRequest(req, res, () => {
    const urlPath = new URL(req.url, "http://localhost").pathname;
    let filePath = path.join(DIST_DIR, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, "index.html");
    }
    const ext = path.extname(filePath);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  startAutoSync();
  console.log(`Agent Use Cases 中文版已启动: http://localhost:${PORT}`);
});
