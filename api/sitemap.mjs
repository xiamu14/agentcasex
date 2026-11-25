const CF_WORKER_URL =
  process.env.CF_WORKER_URL || "https://agentcasex-api.framer02.workers.dev";
const SITE_URL = process.env.SITE_URL || "https://agentcases-ai.vercel.app";

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default async function handler(_req, res) {
  try {
    const r = await fetch(`${CF_WORKER_URL}/api/catalog`, {
      signal: AbortSignal.timeout(15000),
    });
    const catalog = r.ok ? await r.json() : [];

    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>hourly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ];

    if (Array.isArray(catalog)) {
      for (const item of catalog) {
        if (!item?.id) continue;
        const lastmod = item.addedAt || today;
        urls.push(
          `  <url>\n    <loc>${SITE_URL}/use-case/${escapeXml(
            encodeURIComponent(item.id)
          )}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
        );
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
      "\n"
    )}\n</urlset>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=21600");
    res.end(xml);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Failed to generate sitemap");
  }
}
