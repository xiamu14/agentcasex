import { handleApiRequest } from "../server/api-handler.mjs";

const CF_WORKER_URL =
  process.env.CF_WORKER_URL || "https://agentcasex-api.framer02.workers.dev";

const CF_PROXY_PREFIXES = [
  "/api/catalog",
  "/api/trending",
  "/api/votes",
  "/api/detail/",
  "/api/sync-status",
  "/api/sync-now",
];

export default async function handler(req, res) {
  const urlObj = new URL(req.url, "http://localhost");
  const pathname = urlObj.pathname;

  if (CF_PROXY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    try {
      const targetUrl = `${CF_WORKER_URL}${pathname}${urlObj.search}`;
      let bodyBuf;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        bodyBuf = Buffer.concat(chunks);
      }

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          "Content-Type": req.headers["content-type"] || "application/json",
        },
        body: bodyBuf && bodyBuf.length > 0 ? bodyBuf : undefined,
        signal: AbortSignal.timeout(20000),
      });

      const text = await upstreamRes.text();
      res.statusCode = upstreamRes.status;
      res.setHeader(
        "Content-Type",
        upstreamRes.headers.get("content-type") || "application/json; charset=utf-8"
      );
      const cc = upstreamRes.headers.get("cache-control");
      if (cc) res.setHeader("Cache-Control", cc);
      res.end(text);
      return;
    } catch {
      // Fallback to local handler if Worker is unreachable
    }
  }

  return handleApiRequest(req, res, () => {
    res.statusCode = 404;
    res.end("Not found");
  });
}
