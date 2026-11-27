import fs from "node:fs/promises";
import path from "node:path";

const CF_WORKER_URL =
  process.env.CF_WORKER_URL || "https://agentcasex-api.framer02.workers.dev";
const SITE_URL = (
  process.env.SITE_URL || "https://agentcases-ai.vercel.app"
).replace(/\/+$/, "");

let cachedHtml = null;
let cachedHtmlAt = 0;
let cachedCatalog = null;
let cachedCatalogAt = 0;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getBaseHtml(origin) {
  const now = Date.now();
  if (cachedHtml && now - cachedHtmlAt < 300_000) {
    return cachedHtml;
  }

  try {
    const localPath = path.resolve(process.cwd(), "dist/index.html");
    const html = await fs.readFile(localPath, "utf-8");
    cachedHtml = html;
    cachedHtmlAt = now;
    return html;
  } catch {
    // On Vercel serverless, fetch the static index.html from CDN
  }

  const base = origin || SITE_URL;
  const res = await fetch(`${base}/index.html`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`index.html HTTP ${res.status}`);
  const html = await res.text();
  cachedHtml = html;
  cachedHtmlAt = now;
  return html;
}

async function getCatalog() {
  const now = Date.now();
  if (cachedCatalog && now - cachedCatalogAt < 180_000) {
    return cachedCatalog;
  }

  const res = await fetch(`${CF_WORKER_URL}/api/catalog`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    cachedCatalog = data;
    cachedCatalogAt = now;
    return data;
  }
  return [];
}

function injectUseCaseMeta(html, item, pageUrl) {
  const title = escapeHtml(`${item.title} | agentcases.ai`);
  const rawDesc = item.summary
    ? String(item.summary).trim().slice(0, 200)
    : `${item.title} — agentcases.ai AI Agent 真实应用案例与可复用提示词`;
  const desc = escapeHtml(rawDesc);
  const urlEsc = escapeHtml(pageUrl);

  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${urlEsc}" />`
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${desc}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${title}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${desc}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${urlEsc}" />`
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${title}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${desc}" />`
    );

  const tools = Array.isArray(item.tools) ? item.tools.slice(0, 5) : [];
  const toolsHtml =
    tools.length > 0
      ? `<p>使用工具：${escapeHtml(tools.join(" · "))}</p>`
      : "";
  const sourceHtml = item.source?.url
    ? `<p><a href="${escapeHtml(item.source.url)}" rel="noopener noreferrer">查看原帖来源</a></p>`
    : "";
  const articleHtml = `<main><article><h1>${escapeHtml(
    item.title
  )}</h1><p>${desc}</p>${toolsHtml}${sourceHtml}<p><a href="${escapeHtml(
    SITE_URL
  )}/">返回 agentcases.ai 全部 AI Agent 案例目录</a></p></article></main>`;

  out = out.replace(/<main>[\s\S]*?<\/main>/i, articleHtml);

  return out;
}

export default async function handler(req, res) {
  const host = req.headers?.host;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  const origin = host ? `${proto}://${host}` : SITE_URL;

  const urlObj = new URL(req.url || "/", origin);
  let id = urlObj.searchParams.get("id") || "";
  if (!id && urlObj.pathname.startsWith("/use-case/")) {
    id = decodeURIComponent(urlObj.pathname.slice("/use-case/".length));
  }
  id = id.trim();

  try {
    const baseHtml = await getBaseHtml(origin);
    let finalHtml = baseHtml;

    if (id) {
      const catalog = await getCatalog().catch(() => []);
      const item = catalog.find((x) => x?.id === id);
      if (item?.title) {
        const pageUrl = `${SITE_URL}/use-case/${encodeURIComponent(id)}`;
        finalHtml = injectUseCaseMeta(baseHtml, item, pageUrl);
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
    res.end(finalHtml);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Failed to render use-case page");
  }
}
