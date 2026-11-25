const UPSTREAM = "https://agentusecases.ai";

interface Env {
  CACHE: KVNamespace;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200, cacheSeconds = 0) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  };
  if (cacheSeconds > 0) {
    headers["Cache-Control"] = `public, max-age=${cacheSeconds}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

async function translateWithGoogle(text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(
    text
  )}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = (await res.json()) as unknown[];
  if (!Array.isArray(data?.[0])) throw new Error("Invalid Google response");
  return (data[0] as [string][]).map((seg) => seg[0] || "").join("");
}

async function translateBatch(
  texts: string[],
  translationsMap: Record<string, string>,
  maxNewTexts = 60
): Promise<boolean> {
  const missing: string[] = [];
  for (const raw of texts) {
    if (!raw) continue;
    const t = raw.trim();
    if (!t || hasChinese(t) || translationsMap[t] || missing.includes(t)) {
      continue;
    }
    missing.push(t);
    if (missing.length >= maxNewTexts) break;
  }

  if (missing.length === 0) return false;

  const SEP = "\n|||AUCSEP|||\n";
  const chunks: string[][] = [];
  let cur: string[] = [];
  let curLen = 0;

  for (const item of missing) {
    if (cur.length >= 8 || curLen + item.length > 1500) {
      if (cur.length) chunks.push(cur);
      cur = [item];
      curLen = item.length;
    } else {
      cur.push(item);
      curLen += item.length + SEP.length;
    }
  }
  if (cur.length) chunks.push(cur);

  let updated = false;
  for (const group of chunks) {
    const joined = group.join(SEP);
    let parts: string[] | null = null;
    try {
      const batchRes = await translateWithGoogle(joined);
      const split = batchRes.split(/\s*\|{2,3}\s*AUCSEP\s*\|{2,3}\s*/i);
      if (split.length === group.length) {
        parts = split.map((s) => s.trim());
      }
    } catch {
      // Fallback per item
    }

    if (!parts) {
      parts = [];
      for (const item of group) {
        try {
          parts.push(await translateWithGoogle(item));
        } catch {
          parts.push(item);
        }
      }
    }

    group.forEach((orig, idx) => {
      const zh = parts![idx];
      if (zh && zh !== orig) {
        translationsMap[orig] = zh;
        updated = true;
      }
    });
  }

  return updated;
}

async function syncUpstream(env: Env, maxTranslate = 60) {
  const [catRes, trendRes, votesRes] = await Promise.all([
    fetch(`${UPSTREAM}/api/catalog`, { headers: { Accept: "application/json" } }),
    fetch(`${UPSTREAM}/api/trending`, { headers: { Accept: "application/json" } }),
    fetch(`${UPSTREAM}/api/votes`, { headers: { Accept: "application/json" } }),
  ]);

  if (!catRes.ok) throw new Error(`Upstream catalog HTTP ${catRes.status}`);

  const catalog = (await catRes.json()) as Array<{
    id: string;
    title: string;
    summary: string;
    addedAt?: string;
    [k: string]: unknown;
  }>;
  const trending = trendRes.ok
    ? ((await trendRes.json()) as {
        items: Array<{ votes: number; usecase: { id: string; title: string; summary: string; [k: string]: unknown } }>;
      })
    : { items: [] };
  const votes = votesRes.ok ? await votesRes.json() : {};

  const translationsMap =
    ((await env.CACHE.get("translations", "json")) as Record<string, string> | null) || {};

  // Prioritize trending + newest items for incremental translation
  const candidateTexts: string[] = [];
  for (const t of trending.items || []) {
    if (t?.usecase?.title) candidateTexts.push(t.usecase.title);
    if (t?.usecase?.summary) candidateTexts.push(t.usecase.summary);
  }
  const newest = [...catalog].sort((a, b) =>
    String(b.addedAt || "").localeCompare(String(a.addedAt || ""))
  );
  for (const item of newest) {
    if (item.title) candidateTexts.push(item.title);
    if (item.summary) candidateTexts.push(item.summary);
  }

  const changed = await translateBatch(candidateTexts, translationsMap, maxTranslate);
  if (changed) {
    await env.CACHE.put("translations", JSON.stringify(translationsMap));
  }

  const catalogZh = catalog.map((item) => ({
    ...item,
    title: translationsMap[item.title?.trim()] || item.title,
    summary: translationsMap[item.summary?.trim()] || item.summary,
  }));

  const trendingZh = {
    items: (trending.items || []).map((t) => ({
      ...t,
      usecase: {
        ...t.usecase,
        title: translationsMap[t.usecase.title?.trim()] || t.usecase.title,
        summary: translationsMap[t.usecase.summary?.trim()] || t.usecase.summary,
      },
    })),
  };

  const status = {
    enabled: true,
    intervalMinutes: 30,
    syncing: false,
    lastSyncAt: new Date().toISOString(),
    nextSyncAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    lastError: null,
    itemCount: catalogZh.length,
    translatedCount: Object.keys(translationsMap).length,
    source: "cloudflare-worker",
  };

  await Promise.all([
    env.CACHE.put("catalog_zh", JSON.stringify(catalogZh)),
    env.CACHE.put("trending_zh", JSON.stringify(trendingZh)),
    env.CACHE.put("votes", JSON.stringify(votes)),
    env.CACHE.put("sync_status", JSON.stringify(status)),
  ]);

  return status;
}

async function fetchAndTranslateDetail(id: string, env: Env) {
  const cacheKey = `detail_zh:${id}`;
  const cached = await env.CACHE.get(cacheKey, "json");
  if (cached) return cached;

  const res = await fetch(`${UPSTREAM}/use-case/${encodeURIComponent(id)}`, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Detail HTTP ${res.status}`);
  const html = await res.text();

  const sections: Record<string, string> = {};
  const dtRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let m: RegExpExecArray | null;
  while ((m = dtRegex.exec(html)) !== null) {
    const key = stripTags(m[1]).toLowerCase();
    const val = stripTags(m[2]);
    if (key.includes("what they did")) sections.whatTheyDid = val;
    else if (key.includes("how it went")) sections.howItWent = val;
    else if (key.includes("worth knowing")) sections.worthKnowing = val;
  }

  const promptMatch = html.match(/Copy prompt<\/button><\/div><p[^>]*>([\s\S]*?)<\/p>/i);
  const prompt = promptMatch ? stripTags(promptMatch[1]) : "";
  const origMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*>Read the original/i);
  const originalUrl = origMatch ? decodeHtmlEntities(origMatch[1]) : null;

  const localMap: Record<string, string> = {};
  await translateBatch(
    [sections.whatTheyDid, sections.howItWent, sections.worthKnowing, prompt].filter(Boolean),
    localMap,
    10
  );

  const detailZh = {
    id,
    whatTheyDid: localMap[sections.whatTheyDid?.trim()] || sections.whatTheyDid || "",
    howItWent: localMap[sections.howItWent?.trim()] || sections.howItWent || "",
    worthKnowing: localMap[sections.worthKnowing?.trim()] || sections.worthKnowing || "",
    prompt: localMap[prompt?.trim()] || prompt || "",
    originalUrl,
  };

  await env.CACHE.put(cacheKey, JSON.stringify(detailZh));
  return detailZh;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncUpstream(env, 80));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === "/api/catalog" && request.method === "GET") {
        let data = await env.CACHE.get("catalog_zh", "text");
        if (!data) {
          await syncUpstream(env, 40);
          data = await env.CACHE.get("catalog_zh", "text");
        }
        return new Response(data || "[]", {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=180",
            ...CORS_HEADERS,
          },
        });
      }

      if (pathname === "/api/trending" && request.method === "GET") {
        let data = await env.CACHE.get("trending_zh", "text");
        if (!data) {
          await syncUpstream(env, 24);
          data = await env.CACHE.get("trending_zh", "text");
        }
        return new Response(data || '{"items":[]}', {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=180",
            ...CORS_HEADERS,
          },
        });
      }

      if (pathname === "/api/votes" && request.method === "GET") {
        const [upstream, delta] = await Promise.all([
          env.CACHE.get("votes", "json") as Promise<Record<string, number> | null>,
          env.CACHE.get("votes_delta", "json") as Promise<Record<string, number> | null>,
        ]);
        const merged = { ...(upstream || {}) };
        for (const [id, d] of Object.entries(delta || {})) {
          merged[id] = Math.max(0, (merged[id] || 0) + Number(d || 0));
        }
        return jsonResponse(merged, 200, 60);
      }

      if (pathname === "/api/votes" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { id?: string; on?: boolean };
        if (!body.id) return jsonResponse({ error: "Missing id" }, 400);
        const delta =
          ((await env.CACHE.get("votes_delta", "json")) as Record<string, number> | null) || {};
        delta[body.id] = (delta[body.id] || 0) + (body.on ? 1 : -1);
        await env.CACHE.put("votes_delta", JSON.stringify(delta));
        return jsonResponse({ ok: true, id: body.id, delta: delta[body.id] });
      }

      if (pathname.startsWith("/api/detail/") && request.method === "GET") {
        const id = decodeURIComponent(pathname.slice("/api/detail/".length));
        if (!id) return jsonResponse({ error: "Missing id" }, 400);
        const detail = await fetchAndTranslateDetail(id, env);
        return jsonResponse(detail, 200, 600);
      }

      if (pathname === "/api/sync-status" && request.method === "GET") {
        const status = await env.CACHE.get("sync_status", "json");
        return jsonResponse(
          status || { enabled: true, intervalMinutes: 30, source: "cloudflare-worker" }
        );
      }

      if (pathname === "/api/sync-now" && request.method === "POST") {
        const status = await syncUpstream(env, 60);
        return jsonResponse(status);
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : "Worker error" },
        500
      );
    }
  },
};
