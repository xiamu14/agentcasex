import fs from "node:fs";
import path from "node:path";
import {
  addSubscriberToResend,
  isResendConfigured,
  unsubscribeFromResend,
  verifyUnsubscribeToken,
} from "./newsletter.mjs";

const UPSTREAM = "https://agentusecases.ai";
const CACHE_DIR = process.env.VERCEL
  ? "/tmp/.cache"
  : path.resolve(process.cwd(), ".cache");
const DEFAULT_SYNC_MINUTES = Math.max(
  1,
  Number(process.env.SYNC_INTERVAL_MINUTES || 30)
);
const TTL_MS = DEFAULT_SYNC_MINUTES * 60 * 1000;

const syncState = {
  enabled: true,
  intervalMinutes: DEFAULT_SYNC_MINUTES,
  syncing: false,
  lastSyncAt: null,
  nextSyncAt: null,
  lastError: null,
  itemCount: 0,
  newItemsCount: 0,
};

let autoSyncTimer = null;
let autoSyncStarted = false;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(name) {
  return path.join(CACHE_DIR, name);
}

function readJsonFile(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch {}
  return fallback;
}

function writeJsonFile(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("[cache] write error:", file, e.message);
  }
}

// Persistent stores
const translationCacheFile = cachePath("translations.json");
const detailCacheFile = cachePath("details.json");
const localVotesFile = cachePath("local-votes.json");
const submissionsFile = cachePath("submissions.json");
const collectionsConfigFile = cachePath("collections-config.json");
const collectionsRejectedFile = cachePath("collections-rejected.json");

const DEFAULT_COLLECTIONS = [
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

const CANDIDATE_RADAR = [
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

function matchCol(item, col) {
  try {
    return new RegExp(col.pattern, "i").test(`${item.title || ""} ${item.summary || ""}`);
  } catch {
    return false;
  }
}

const translationsMap = readJsonFile(translationCacheFile, {});
const detailsMap = readJsonFile(detailCacheFile, {});
let localVotes = readJsonFile(localVotesFile, {});
let localSubmissions = readJsonFile(submissionsFile, []);

let translationSaveTimer = null;
function scheduleSaveTranslations() {
  if (translationSaveTimer) return;
  translationSaveTimer = setTimeout(() => {
    translationSaveTimer = null;
    writeJsonFile(translationCacheFile, translationsMap);
  }, 800);
}

const memCache = new Map();

async function fetchUpstreamJson(endpoint, cacheFileName, forceRefresh = false) {
  const now = Date.now();
  const mem = memCache.get(endpoint);
  if (!forceRefresh && mem && now - mem.ts < TTL_MS) {
    return mem.data;
  }

  const diskFile = cachePath(cacheFileName);
  if (!forceRefresh && fs.existsSync(diskFile)) {
    const stat = fs.statSync(diskFile);
    if (now - stat.mtimeMs < TTL_MS) {
      const data = readJsonFile(diskFile, null);
      if (data !== null) {
        memCache.set(endpoint, { ts: stat.mtimeMs, data });
        return data;
      }
    }
  }

  try {
    const res = await fetch(`${UPSTREAM}${endpoint}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    memCache.set(endpoint, { ts: now, data });
    writeJsonFile(diskFile, data);
    return data;
  } catch (err) {
    console.warn(`[upstream] failed ${endpoint}:`, err.message);
    const stale = readJsonFile(diskFile, null);
    if (stale !== null) return stale;
    throw err;
  }
}

function decodeHtmlEntities(str) {
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

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

async function translateDetailFields(detail) {
  const fields = [
    detail.whatTheyDid,
    detail.howItWent,
    detail.worthKnowing,
    detail.prompt,
  ].filter(Boolean);
  if (fields.length === 0) return detail;
  const zhMap = await translateBatch(fields);
  return {
    ...detail,
    whatTheyDid: zhMap[detail.whatTheyDid?.trim()] || detail.whatTheyDid || "",
    howItWent: zhMap[detail.howItWent?.trim()] || detail.howItWent || "",
    worthKnowing: zhMap[detail.worthKnowing?.trim()] || detail.worthKnowing || "",
    prompt: zhMap[detail.prompt?.trim()] || detail.prompt || "",
  };
}

async function fetchUseCaseDetail(id) {
  if (detailsMap[id]) {
    return translateDetailFields(detailsMap[id]);
  }

  // Check if it's a locally submitted use case
  const localItem = localSubmissions.find((x) => x.id === id);
  if (localItem) {
    return {
      id,
      whatTheyDid: localItem.whatTheyDid || localItem.summary,
      howItWent: localItem.howItWent || "",
      worthKnowing: localItem.worthKnowing || "",
      prompt: localItem.prompt || "",
      originalUrl: localItem.link || localItem.source?.url || null,
    };
  }

  const res = await fetch(`${UPSTREAM}/use-case/${encodeURIComponent(id)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    throw new Error(`Detail HTTP ${res.status}`);
  }
  const html = await res.text();

  const sections = {};
  const dtRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let m;
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

  const detail = await translateDetailFields({
    id,
    whatTheyDid: sections.whatTheyDid || "",
    howItWent: sections.howItWent || "",
    worthKnowing: sections.worthKnowing || "",
    prompt,
    originalUrl,
  });

  detailsMap[id] = detail;
  writeJsonFile(detailCacheFile, detailsMap);
  return detail;
}

async function translateWithGoogle(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.[0])) throw new Error("Invalid Google response");
  return data[0].map((seg) => seg[0] || "").join("");
}

async function translateWithMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=en|zh-CN`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || translated.includes("MYMEMORY WARNING")) {
    throw new Error("MyMemory quota/invalid");
  }
  return translated;
}

async function translateBatch(texts) {
  const result = {};
  const missing = [];

  for (const raw of texts) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (translationsMap[t]) {
      result[t] = translationsMap[t];
    } else if (!missing.includes(t)) {
      missing.push(t);
    }
  }

  if (missing.length === 0) {
    return result;
  }

  // Group into safe chunks (<= 1600 chars) to avoid Google Translate truncation/429
  const SEP = "\n|||AUCSEP|||\n";
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const item of missing) {
    if (current.length >= 8 || currentLen + item.length > 1600) {
      if (current.length) chunks.push(current);
      current = [item];
      currentLen = item.length;
    } else {
      current.push(item);
      currentLen += item.length + SEP.length;
    }
  }
  if (current.length) chunks.push(current);

  for (const group of chunks) {
    const joined = group.join(SEP);
    let translatedParts = null;

    try {
      const batchRes = await translateWithGoogle(joined);
      const split = batchRes.split(/\s*\|{2,3}\s*AUCSEP\s*\|{2,3}\s*/i);
      if (split.length === group.length) {
        translatedParts = split.map((s) => s.trim());
      }
    } catch {
      // Fallback to per-item translation below
    }

    if (!translatedParts) {
      translatedParts = [];
      for (const item of group) {
        let zh = item;
        try {
          zh = await translateWithGoogle(item);
        } catch {
          try {
            zh = await translateWithMyMemory(item);
          } catch {
            zh = item;
          }
        }
        translatedParts.push(zh);
      }
    }

    group.forEach((orig, i) => {
      const zh = translatedParts[i] || orig;
      if (zh && zh !== orig) {
        translationsMap[orig] = zh;
      }
      result[orig] = zh;
    });
  }

  scheduleSaveTranslations();
  return result;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export async function runFullSync(reason = "scheduled") {
  if (syncState.syncing) return getSyncStatus();
  syncState.syncing = true;
  syncState.lastError = null;
  const startedAt = Date.now();

  try {
    const prevCatalog = readJsonFile(cachePath("catalog.json"), []);
    const prevIds = new Set(Array.isArray(prevCatalog) ? prevCatalog.map((x) => x.id) : []);

    const [catalog, trending] = await Promise.all([
      fetchUpstreamJson("/api/catalog", "catalog.json", true),
      fetchUpstreamJson("/api/trending", "trending.json", true),
      fetchUpstreamJson("/api/votes", "votes.json", true),
      fetchUpstreamJson("/api/sponsors", "sponsors.json", true),
    ]);

    const newItems = Array.isArray(catalog)
      ? catalog.filter((x) => !prevIds.has(x.id))
      : [];

    syncState.itemCount = Array.isArray(catalog) ? catalog.length : 0;
    syncState.newItemsCount = newItems.length;
    syncState.lastSyncAt = new Date().toISOString();
    syncState.nextSyncAt = new Date(
      Date.now() + syncState.intervalMinutes * 60 * 1000
    ).toISOString();

    // Background incremental translation for trending + newest items
    const toTranslate = [];
    if (Array.isArray(trending?.items)) {
      for (const t of trending.items) {
        if (t?.usecase?.title) toTranslate.push(t.usecase.title);
      }
    }
    const latestSlice = (newItems.length > 0 ? newItems : (Array.isArray(catalog) ? catalog : [])).slice(0, 15);
    for (const item of latestSlice) {
      if (item?.title) toTranslate.push(item.title);
      if (item?.summary) toTranslate.push(item.summary);
    }
    if (toTranslate.length > 0) {
      await translateBatch(toTranslate).catch(() => {});
    }

    console.log(
      `[auto-sync] (${reason}) synced ${syncState.itemCount} items (+${newItems.length} new) in ${Date.now() - startedAt}ms`
    );
  } catch (err) {
    syncState.lastError = err?.message || "Sync failed";
    syncState.nextSyncAt = new Date(
      Date.now() + syncState.intervalMinutes * 60 * 1000
    ).toISOString();
    console.warn(`[auto-sync] (${reason}) failed:`, syncState.lastError);
  } finally {
    syncState.syncing = false;
  }

  return getSyncStatus();
}

export function getSyncStatus() {
  return {
    ...syncState,
    translatedCount: Object.keys(translationsMap).length,
  };
}

export function startAutoSync() {
  if (autoSyncStarted) return;
  autoSyncStarted = true;

  const intervalMs = syncState.intervalMinutes * 60 * 1000;
  syncState.nextSyncAt = new Date(Date.now() + 2000).toISOString();

  // Initial sync shortly after server startup
  setTimeout(() => {
    runFullSync("startup");
  }, 2000);

  autoSyncTimer = setInterval(() => {
    runFullSync("scheduled");
  }, intervalMs);

  // Don't keep CLI processes alive solely because of the interval
  if (typeof autoSyncTimer.unref === "function") {
    autoSyncTimer.unref();
  }
}

export async function handleApiRequest(req, res, next) {
  const urlObj = new URL(req.url, "http://localhost");
  const pathname = urlObj.pathname;
  const forceRefresh = urlObj.searchParams.get("refresh") === "1";

  if (!pathname.startsWith("/api/")) {
    return next();
  }

  try {
    // 0. Sync status & manual trigger
    if (pathname === "/api/sync-status" && req.method === "GET") {
      return sendJson(res, 200, getSyncStatus());
    }

    if (pathname === "/api/sync-now" && req.method === "POST") {
      const status = await runFullSync("manual");
      return sendJson(res, 200, status);
    }

    // 0b. Collections & candidate review
    if (pathname === "/api/collections" && req.method === "GET") {
      const active = readJsonFile(collectionsConfigFile, DEFAULT_COLLECTIONS);
      const rejected = new Set(readJsonFile(collectionsRejectedFile, []));
      const activeIds = new Set(active.map((c) => c.id));
      const upstream = await fetchUpstreamJson("/api/catalog", "catalog.json", false).catch(() => []);
      const localized = (Array.isArray(upstream) ? upstream : []).map((item) => ({
        ...item,
        title: translationsMap[item.title?.trim()] || item.title,
        summary: translationsMap[item.summary?.trim()] || item.summary,
      }));
      const pending = CANDIDATE_RADAR.filter(
        (c) => !activeIds.has(c.id) && !rejected.has(c.id)
      )
        .map((c) => {
          const matched = localized.filter((it) => matchCol(it, c));
          return {
            ...c,
            count: matched.length,
            samples: matched.slice(0, 3).map((m) => String(m.title || "")),
            discoveredAt: new Date().toISOString(),
          };
        })
        .filter((c) => c.count >= 10);
      return sendJson(res, 200, { active, pending });
    }

    if (pathname === "/api/collections/review" && req.method === "POST") {
      const body = await readRequestBody(req);
      if (!body?.id || (body.action !== "approve" && body.action !== "reject")) {
        return sendJson(res, 400, { error: "Invalid review payload" });
      }
      const active = readJsonFile(collectionsConfigFile, [...DEFAULT_COLLECTIONS]);
      const rejected = readJsonFile(collectionsRejectedFile, []);
      if (body.action === "approve") {
        const candidate = CANDIDATE_RADAR.find((c) => c.id === body.id);
        if (candidate && !active.some((c) => c.id === candidate.id)) {
          active.push({
            ...candidate,
            label: String(body.label || candidate.label).trim().slice(0, 10),
          });
          writeJsonFile(collectionsConfigFile, active);
        }
      } else if (!rejected.includes(body.id)) {
        rejected.push(body.id);
        writeJsonFile(collectionsRejectedFile, rejected);
      }
      return sendJson(res, 200, { ok: true, active });
    }
    // 1. Catalog (upstream + local submissions, pre-localized with cached translations)
    if (pathname === "/api/catalog" && req.method === "GET") {
      const upstream = await fetchUpstreamJson("/api/catalog", "catalog.json", forceRefresh);
      const merged = [...localSubmissions, ...(Array.isArray(upstream) ? upstream : [])];
      const localized = merged.map((item) => ({
        ...item,
        title: translationsMap[item.title?.trim()] || item.title,
        summary: translationsMap[item.summary?.trim()] || item.summary,
      }));
      return sendJson(res, 200, localized);
    }

    // 2. Trending (pre-localized with cached translations)
    if (pathname === "/api/trending" && req.method === "GET") {
      const data = await fetchUpstreamJson("/api/trending", "trending.json", forceRefresh);
      const localized = {
        items: (Array.isArray(data?.items) ? data.items : []).map((t) => ({
          ...t,
          usecase: t?.usecase
            ? {
                ...t.usecase,
                title: translationsMap[t.usecase.title?.trim()] || t.usecase.title,
                summary: translationsMap[t.usecase.summary?.trim()] || t.usecase.summary,
              }
            : t?.usecase,
        })),
      };
      return sendJson(res, 200, localized);
    }

    // 3. Sponsors
    if (pathname === "/api/sponsors" && req.method === "GET") {
      const data = await fetchUpstreamJson("/api/sponsors", "sponsors.json", forceRefresh);
      return sendJson(res, 200, data);
    }

    // 4. Votes (upstream + local delta)
    if (pathname === "/api/votes" && req.method === "GET") {
      const upstream = await fetchUpstreamJson("/api/votes", "votes.json", forceRefresh);
      const merged = { ...(upstream || {}) };
      for (const [id, delta] of Object.entries(localVotes)) {
        merged[id] = Math.max(0, (merged[id] || 0) + Number(delta || 0));
      }
      return sendJson(res, 200, merged);
    }

    if (pathname === "/api/votes" && req.method === "POST") {
      const body = await readRequestBody(req);
      const { id, on } = body;
      if (!id) return sendJson(res, 400, { error: "Missing id" });
      localVotes[id] = (localVotes[id] || 0) + (on ? 1 : -1);
      writeJsonFile(localVotesFile, localVotes);
      return sendJson(res, 200, { ok: true, id, delta: localVotes[id] });
    }

    // 5. Use case detail (proxied & parsed from upstream HTML)
    if (pathname.startsWith("/api/detail/") && req.method === "GET") {
      const id = decodeURIComponent(pathname.slice("/api/detail/".length));
      if (!id) return sendJson(res, 400, { error: "Missing id" });
      const detail = await fetchUseCaseDetail(id);
      return sendJson(res, 200, detail);
    }

    // 6. Batch translate to Simplified Chinese with disk cache
    if (pathname === "/api/translate" && req.method === "POST") {
      const body = await readRequestBody(req);
      const texts = Array.isArray(body?.texts) ? body.texts : [];
      const translations = await translateBatch(texts);
      return sendJson(res, 200, { translations });
    }

    // 7. Submit new use case (saved locally)
    if (pathname === "/api/submissions" && req.method === "POST") {
      const body = await readRequestBody(req);
      const title = String(body.title || "").trim();
      const summary = String(body.summary || "").trim();
      if (!title || !summary) {
        return sendJson(res, 400, { error: "请填写标题和简介" });
      }
      const slug =
        "local-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6);
      const today = new Date().toISOString().slice(0, 10);
      const toolName = String(body.tool || "Claude Code").trim();
      const newItem = {
        id: slug,
        title,
        summary,
        category: body.category || "operations",
        tools: toolName ? [toolName] : [],
        link: body.url ? String(body.url).trim() : null,
        source: {
          platform: "web",
          url: body.url ? String(body.url).trim() : "https://agentusecases.ai",
          author: body.author ? String(body.author).trim() : "本地投稿",
          score: null,
          date: today,
        },
        addedAt: today,
        agents: {
          filter: toolName ? [toolName] : [],
          labels: toolName ? [toolName] : [],
          known: Boolean(toolName),
        },
        accounts: 1,
        described: true,
        submittedBy: body.author ? String(body.author).trim() : "本地用户",
        whatTheyDid: String(body.whatTheyDid || summary).trim(),
        howItWent: String(body.howItWent || "").trim(),
        worthKnowing: String(body.worthKnowing || "").trim(),
        prompt: String(body.prompt || "").trim(),
        isLocal: true,
      };
      localSubmissions = [newItem, ...localSubmissions];
      writeJsonFile(submissionsFile, localSubmissions);
      return sendJson(res, 200, { ok: true, item: newItem });
    }

    // 8. Subscribe (Resend Audiences when configured, local .cache fallback otherwise)
    if (pathname === "/api/subscribe" && req.method === "POST") {
      const body = await readRequestBody(req);
      const email = String(body?.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { error: "请输入有效的邮箱地址" });
      }

      if (isResendConfigured()) {
        await addSubscriberToResend(email);
        return sendJson(res, 200, { ok: true, mode: "resend" });
      }

      const subscribersFile = cachePath("subscribers.json");
      const list = readJsonFile(subscribersFile, []);
      if (!list.some((s) => s.email === email)) {
        list.push({
          email,
          source: body?.source || "unknown",
          createdAt: new Date().toISOString(),
        });
        writeJsonFile(subscribersFile, list);
      }
      return sendJson(res, 200, { ok: true, mode: "local" });
    }

    // 9. One-click unsubscribe
    if (pathname === "/api/unsubscribe" && (req.method === "GET" || req.method === "POST")) {
      const email = String(urlObj.searchParams.get("email") || "").trim().toLowerCase();
      const token = urlObj.searchParams.get("token") || "";
      if (!email || !verifyUnsubscribeToken(email, token)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end("<h3>退订链接无效或已过期</h3>");
        return;
      }

      if (isResendConfigured()) {
        await unsubscribeFromResend(email);
      } else {
        const subscribersFile = cachePath("subscribers.json");
        const list = readJsonFile(subscribersFile, []);
        writeJsonFile(
          subscribersFile,
          list.filter((s) => s.email !== email)
        );
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html lang="zh-CN"><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:24px;text-align:center;">
        <h2>已成功退订</h2>
        <p style="color:#525252;">邮箱 <strong>${email}</strong> 已从 agentcases.ai 每日精选列表中移除。</p>
        <p style="margin-top:24px;"><a href="/" style="color:#0b63ce;">返回 agentcases.ai</a></p>
      </body></html>`);
      return;
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[api error]", pathname, err);
    return sendJson(res, 500, { error: err?.message || "Internal server error" });
  }
}
