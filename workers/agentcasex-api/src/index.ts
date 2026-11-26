import { UPSTREAM_CONFIG } from "../../../config.ts";

const UPSTREAM = UPSTREAM_CONFIG.url;

interface Env {
  CACHE: KVNamespace;
  INGEST_TOKEN?: string;
}

interface CollectionDef {
  id: string;
  label: string;
  pattern: string;
  description?: string;
}

const DEFAULT_COLLECTIONS: CollectionDef[] = [
  {
    id: "ai-trading",
    label: "AI 自动交易",
    pattern:
      "\\b(trad(e|ing|er)|stock|stocks|portfolio|alpaca|crypto|bitcoin|polymarket|options|hedge fund|backtest|investing|quant|ticker)\\b|股票|交易|投资组合|量化|期权",
    description: "股票、ETF、期权、预测市场等自动交易决策",
  },
  {
    id: "browser-auto",
    label: "浏览器自动化",
    pattern:
      "\\b(browser|chrome|playwright|puppeteer|fill out|scrape|scraping|headless|browser-use)\\b|浏览器|自动填表|网页抓取|无头浏览器",
    description: "Chrome / Playwright 模拟操作、自动填表与抓取",
  },
  {
    id: "self-hosted",
    label: "7×24 定时后台",
    pattern:
      "\\b(24/7|24-hour|cron|nightly|every morning|every day|every two hours|self-hosted|vps|daemon|heartbeat)\\b|每天早上|每晚|定时|每两小时|24小时|自托管",
    description: "无人值守定时任务、每日巡检与常驻后台代理",
  },
  {
    id: "voice-call",
    label: "AI 打电话语音",
    pattern:
      "\\b(phone call|cold call|call (the|a|an|my)|vapi|twilio|voice agent|voicemail)\\b|打电话|电话语音|语音代理|致电",
    description: "语音代理自动致电预约、客服通话与砍价协商",
  },
  {
    id: "multi-agent",
    label: "多智能体协同",
    pattern:
      "\\b(multi-agent|swarm|team of|orchestrat|subagent|11-agent|parallel agents|agent team|crew)\\b|多智能体|多代理|并行代理|代理团队",
    description: "Agent Swarm 与多角色分工协作流水线",
  },
  {
    id: "earn-money",
    label: "AI 自动赚钱",
    pattern:
      "\\b(earn money|freelance|upwork|fiverr|side hustle|revenue|monetize|sell services|make money|bounty)\\b|赚钱|接单|自由职业|副业|变现",
    description: "自由职业接单、自动交付服务与副业变现",
  },
];

// Emerging cross-category candidate patterns evaluated during scheduled syncs
const CANDIDATE_RADAR: CollectionDef[] = [
  {
    id: "mcp-tools",
    label: "MCP 工具链",
    pattern: "\\b(mcp|model context protocol)\\b|MCP",
    description: "基于 Model Context Protocol 连接外部工具与本地数据",
  },
  {
    id: "local-llm",
    label: "本地开源模型",
    pattern: "\\b(ollama|local llm|qwen|llama|deepseek|vllm|lm studio)\\b|本地模型|开源模型",
    description: "使用 Ollama、Qwen、DeepSeek 等本地推理驱动 Agent",
  },
  {
    id: "notion-obsidian",
    label: "双链笔记整理",
    pattern: "\\b(obsidian|notion|second brain|knowledge graph)\\b|双链|知识库",
    description: "自动同步整理 Notion 与 Obsidian 个人知识库",
  },
  {
    id: "iot-hardware",
    label: "硬件与物联网",
    pattern: "\\b(raspberry pi|arduino|esp32|smart home|home assistant|3d print|cad|iot)\\b|树莓派|智能家居|硬件|物联网",
    description: "智能家居控制、嵌入式硬件与 3D/CAD 驱动",
  },
];

function matchCol(item: { title?: string; summary?: string }, col: CollectionDef): boolean {
  try {
    return new RegExp(col.pattern, "i").test(`${item.title || ""} ${item.summary || ""}`);
  } catch {
    return false;
  }
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

interface CatalogItem {
  id: string;
  title: string;
  summary: string;
  category?: string;
  tools?: string[];
  link?: string | null;
  source?: { platform?: string; url?: string; author?: string | null; score?: number | null; date?: string | null };
  addedAt?: string;
  collections?: string[];
  crawlSource?: "agent-reach" | "upstream";
  [k: string]: unknown;
}

function normalizeUrlForDedup(raw?: string | null): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.trim());
    for (const k of [...u.searchParams.keys()]) {
      if (k.startsWith("utm_") || k === "ref" || k === "fbclid" || k === "spm_id_from") {
        u.searchParams.delete(k);
      }
    }
    const qs = u.searchParams.toString();
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${qs ? `?${qs}` : ""}`;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function normalizeTitleForDedup(title?: string | null): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function mergeAndDedupeCatalog(
  selfItems: CatalogItem[],
  upstreamItems: CatalogItem[],
  activeCollections: CollectionDef[]
): CatalogItem[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: CatalogItem[] = [];

  const addIfUnique = (item: CatalogItem, crawlSource: "agent-reach" | "upstream") => {
    const id = String(item.id || "").trim();
    if (!id || seenIds.has(id)) return;
    const urlKey = normalizeUrlForDedup(item.source?.url || item.link || null);
    const titleKey = normalizeTitleForDedup(item.title);
    if (urlKey && seenUrls.has(urlKey)) return;
    if (titleKey && titleKey.length >= 6 && seenTitles.has(titleKey)) return;

    seenIds.add(id);
    if (urlKey) seenUrls.add(urlKey);
    if (titleKey && titleKey.length >= 6) seenTitles.add(titleKey);

    const matchedCols = activeCollections
      .filter((col) => matchCol(item, col))
      .map((col) => col.id);
    merged.push({ ...item, crawlSource, collections: matchedCols });
  };

  // Self-crawled items take priority during coexistence
  for (const item of selfItems) addIfUnique(item, "agent-reach");
  for (const item of upstreamItems) addIfUnique(item, "upstream");

  return merged;
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

  const [activeCollectionsRaw, rejectedIdsRaw, selfCrawledRaw] = await Promise.all([
    env.CACHE.get("collections_config", "json"),
    env.CACHE.get("collections_rejected", "json"),
    env.CACHE.get("self_crawled_catalog", "json"),
  ]);
  const activeCollections = (activeCollectionsRaw as CollectionDef[] | null) || DEFAULT_COLLECTIONS;
  const rejectedIds = (rejectedIdsRaw as string[] | null) || [];
  const selfCrawled = (selfCrawledRaw as CatalogItem[] | null) || [];

  const upstreamZh: CatalogItem[] = catalog.map((item) => ({
    ...item,
    title: translationsMap[item.title?.trim()] || item.title,
    summary: translationsMap[item.summary?.trim()] || item.summary,
  }));

  const catalogZh = mergeAndDedupeCatalog(selfCrawled, upstreamZh, activeCollections);

  // Discover candidate collections from emerging cross-category topics
  const activeIds = new Set(activeCollections.map((c) => c.id));
  const rejectedSet = new Set(rejectedIds);
  const candidates = CANDIDATE_RADAR.filter(
    (c) => !activeIds.has(c.id) && !rejectedSet.has(c.id)
  )
    .map((c) => {
      const matched = catalogZh.filter((it) => matchCol(it, c));
      return {
        ...c,
        count: matched.length,
        samples: matched.slice(0, 3).map((m) => String(m.title || "")),
        discoveredAt: new Date().toISOString(),
      };
    })
    .filter((c) => c.count >= 10);

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
    env.CACHE.put("collections_config", JSON.stringify(activeCollections)),
    env.CACHE.put("collections_candidates", JSON.stringify(candidates)),
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

      if (pathname === "/api/ingest" && request.method === "POST") {
        if (env.INGEST_TOKEN) {
          const auth = request.headers.get("Authorization") || "";
          if (auth !== `Bearer ${env.INGEST_TOKEN}`) {
            return jsonResponse({ error: "Unauthorized" }, 401);
          }
        }
        const body = (await request.json().catch(() => ({}))) as {
          items?: Array<{
            usecase: CatalogItem;
            detail?: {
              id?: string;
              whatTheyDid?: string;
              howItWent?: string;
              worthKnowing?: string;
              prompt?: string;
              originalUrl?: string | null;
            };
          }>;
        };
        const incoming = Array.isArray(body.items) ? body.items : [];
        if (incoming.length === 0) {
          return jsonResponse({ ok: true, added: 0, skipped: 0 });
        }

        const [selfRaw, catalogRaw, activeRaw] = await Promise.all([
          env.CACHE.get("self_crawled_catalog", "json"),
          env.CACHE.get("catalog_zh", "json"),
          env.CACHE.get("collections_config", "json"),
        ]);
        const selfCatalog = (selfRaw as CatalogItem[] | null) || [];
        const existingCatalog = (catalogRaw as CatalogItem[] | null) || [];
        const activeCollections = (activeRaw as CollectionDef[] | null) || DEFAULT_COLLECTIONS;

        const existingIds = new Set(existingCatalog.map((i) => String(i.id)));
        const existingUrls = new Set(
          existingCatalog.map((i) => normalizeUrlForDedup(i.source?.url || i.link || null)).filter(Boolean)
        );
        const existingTitles = new Set(
          existingCatalog.map((i) => normalizeTitleForDedup(i.title)).filter((t) => t.length >= 6)
        );

        let added = 0;
        let skipped = 0;
        const detailWrites: Promise<void>[] = [];

        for (const entry of incoming) {
          const uc = entry?.usecase;
          if (!uc?.id || !uc?.title) {
            skipped++;
            continue;
          }
          const urlKey = normalizeUrlForDedup(uc.source?.url || uc.link || null);
          const titleKey = normalizeTitleForDedup(uc.title);
          if (
            existingIds.has(uc.id) ||
            (urlKey && existingUrls.has(urlKey)) ||
            (titleKey && titleKey.length >= 6 && existingTitles.has(titleKey))
          ) {
            skipped++;
            continue;
          }

          existingIds.add(uc.id);
          if (urlKey) existingUrls.add(urlKey);
          if (titleKey && titleKey.length >= 6) existingTitles.add(titleKey);

          const taggedItem: CatalogItem = { ...uc, crawlSource: "agent-reach" };
          selfCatalog.unshift(taggedItem);
          added++;

          if (entry.detail) {
            detailWrites.push(
              env.CACHE.put(
                `detail_zh:${uc.id}`,
                JSON.stringify({
                  id: uc.id,
                  whatTheyDid: entry.detail.whatTheyDid || "",
                  howItWent: entry.detail.howItWent || "",
                  worthKnowing: entry.detail.worthKnowing || "",
                  prompt: entry.detail.prompt || "",
                  originalUrl: entry.detail.originalUrl ?? uc.source?.url ?? uc.link ?? null,
                })
              )
            );
          }
        }

        if (added > 0) {
          const upstreamOnly = existingCatalog.filter((i) => i.crawlSource !== "agent-reach");
          const mergedCatalog = mergeAndDedupeCatalog(selfCatalog, upstreamOnly, activeCollections);
          await Promise.all([
            ...detailWrites,
            env.CACHE.put("self_crawled_catalog", JSON.stringify(selfCatalog)),
            env.CACHE.put("catalog_zh", JSON.stringify(mergedCatalog)),
          ]);
        }

        return jsonResponse({ ok: true, added, skipped, selfTotal: selfCatalog.length });
      }

      if (pathname === "/api/collections" && request.method === "GET") {
        const [active, pending, catalogStr] = await Promise.all([
          env.CACHE.get("collections_config", "json") as Promise<CollectionDef[] | null>,
          env.CACHE.get("collections_candidates", "json") as Promise<unknown[] | null>,
          env.CACHE.get("catalog_zh", "text"),
        ]);
        const activeList = active || DEFAULT_COLLECTIONS;
        let pendingList = pending;
        if (!pendingList && catalogStr) {
          const catalogZh = JSON.parse(catalogStr) as Array<{ title?: string; summary?: string }>;
          const rejectedIds =
            ((await env.CACHE.get("collections_rejected", "json")) as string[] | null) || [];
          const activeIds = new Set(activeList.map((c) => c.id));
          const rejectedSet = new Set(rejectedIds);
          pendingList = CANDIDATE_RADAR.filter(
            (c) => !activeIds.has(c.id) && !rejectedSet.has(c.id)
          )
            .map((c) => {
              const matched = catalogZh.filter((it) => matchCol(it, c));
              return {
                ...c,
                count: matched.length,
                samples: matched.slice(0, 3).map((m) => String(m.title || "")),
                discoveredAt: new Date().toISOString(),
              };
            })
            .filter((c) => c.count >= 10);
        }
        return jsonResponse({ active: activeList, pending: pendingList || [] }, 200, 60);
      }

      if (pathname === "/api/collections/review" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as {
          id?: string;
          action?: "approve" | "reject";
          label?: string;
        };
        if (!body.id || (body.action !== "approve" && body.action !== "reject")) {
          return jsonResponse({ error: "Invalid review payload" }, 400);
        }
        const active =
          ((await env.CACHE.get("collections_config", "json")) as CollectionDef[] | null) ||
          [...DEFAULT_COLLECTIONS];
        const rejected =
          ((await env.CACHE.get("collections_rejected", "json")) as string[] | null) || [];
        const pending =
          ((await env.CACHE.get("collections_candidates", "json")) as CollectionDef[] | null) || [];

        if (body.action === "approve") {
          const candidate =
            pending.find((c) => c.id === body.id) ||
            CANDIDATE_RADAR.find((c) => c.id === body.id);
          if (candidate && !active.some((c) => c.id === candidate.id)) {
            active.push({
              id: candidate.id,
              label: (body.label || candidate.label).trim().slice(0, 10),
              pattern: candidate.pattern,
              description: candidate.description,
            });
          }
        } else {
          if (!rejected.includes(body.id)) rejected.push(body.id);
        }

        const nextPending = pending.filter((c) => c.id !== body.id);
        await Promise.all([
          env.CACHE.put("collections_config", JSON.stringify(active)),
          env.CACHE.put("collections_rejected", JSON.stringify(rejected)),
          env.CACHE.put("collections_candidates", JSON.stringify(nextPending)),
        ]);
        return jsonResponse({ ok: true, active, pending: nextPending });
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
