import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import {
  CRAWL_CONFIG,
  LLM_CONFIG,
  VALID_CATEGORIES,
  WORKER_CONFIG,
  type NoLoginChannel,
} from "../config.ts";

const execFileAsync = promisify(execFile);

interface ReachItem {
  title?: string;
  url?: string;
  author?: string;
  published_at?: string;
  text?: string;
  raw?: Record<string, unknown>;
}

interface ReachResponse {
  ok: boolean;
  items?: ReachItem[];
  error?: { code?: string; message?: string; hint?: string };
}

interface StructuredExtraction {
  isValidUseCase: boolean;
  reason?: string;
  title?: string;
  summary?: string;
  category?: string;
  tools?: string[];
  whatTheyDid?: string;
  howItWent?: string;
  worthKnowing?: string;
  prompt?: string;
}

const lastCallByPlatform = new Map<string, number>();

async function throttlePlatform(channel: string) {
  const last = lastCallByPlatform.get(channel) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < CRAWL_CONFIG.minPlatformIntervalMs) {
    await new Promise((r) => setTimeout(r, CRAWL_CONFIG.minPlatformIntervalMs - elapsed));
  }
  lastCallByPlatform.set(channel, Date.now());
}

async function runReach(channel: string, args: string[]): Promise<ReachResponse> {
  await throttlePlatform(channel);
  try {
    const { stdout } = await execFileAsync("agent-reach", args, {
      timeout: CRAWL_CONFIG.commandTimeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim()) as ReachResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "EXEC_ERROR", message: msg } };
  }
}

function normalizeUrl(raw?: string | null): string {
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

function normalizeTitle(title?: string | null): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function makeStableId(platform: string, url: string): string {
  const hash = crypto.createHash("sha1").update(normalizeUrl(url) || url).digest("hex").slice(0, 12);
  return `ar-${platform}-${hash}`;
}

async function structureWithLLM(
  apiKey: string,
  channel: string,
  item: ReachItem
): Promise<StructuredExtraction | null> {
  const bodyText = (item.text || "").slice(0, 4500);
  if (bodyText.length < 80) return null;

  const systemPrompt = `你是 agentcases.ai 的 AI Agent 应用案例编辑。请判断输入内容是否是一个「真实、可复现的 AI Agent 实战应用案例或自动化工作流」（排除纯新闻快讯、空泛观点、纯招聘广告、无实操细节的营销软文）。
如果是有效案例，请提炼并输出为自然、精炼的简体中文 JSON；如果不是，返回 {"isValidUseCase": false, "reason": "..."}。

可选 category（必须严格选其一）: ${VALID_CATEGORIES.join(", ")}

仅输出合法 JSON（不要 markdown 代码块），结构如下：
{
  "isValidUseCase": true,
  "title": "不超过36字的中文标题，直击场景与效果",
  "summary": "1-2句中文摘要，说明用了什么 Agent 做了什么事、结果如何",
  "category": "software",
  "tools": ["Claude Code", "MCP"],
  "whatTheyDid": "具体实操步骤与工作流拆解（2-4句中文）",
  "howItWent": "实际运行效果、量化收益或局限（1-3句中文）",
  "worthKnowing": "避坑经验、配置要点或注意事项（1-2句中文）",
  "prompt": "一条可直接复制给 AI Agent 复现该工作流的中文提示词"
}`;

  const userPrompt = `来源平台: ${channel}
原标题: ${item.title || ""}
作者: ${item.author || ""}
链接: ${item.url || ""}
正文内容:
${bodyText}`;

  const res = await fetch(LLM_CONFIG.chatCompletionsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://agentcases-ai.vercel.app/",
      "X-Title": "agentcases.ai",
    },
    body: JSON.stringify({
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature,
      max_tokens: LLM_CONFIG.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = data.choices?.[0]?.message?.content?.trim() || "";
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as StructuredExtraction;
  } catch {
    return null;
  }
}

async function collectChannelCandidates(
  channel: NoLoginChannel,
  limitPerQuery: number
): Promise<Array<{ channel: NoLoginChannel; item: ReachItem }>> {
  const collected: Array<{ channel: NoLoginChannel; item: ReachItem }> = [];
  const stopCodes = new Set(["RATE_LIMITED", "PLATFORM_BLOCKED", "NEED_LOGIN", "NEED_SETUP"]);

  const pushItems = (items?: ReachItem[]) => {
    for (const it of items || []) {
      if (it?.url && it?.title) collected.push({ channel, item: it });
    }
  };

  if (channel === "github") {
    for (const q of CRAWL_CONFIG.queries.github) {
      const searchRes = await runReach("github", ["github", "search", q, "--limit", String(limitPerQuery)]);
      if (!searchRes.ok) {
        console.warn(`[github] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (!hit.url) continue;
        const readRes = await runReach("github", ["github", "read", hit.url]);
        if (readRes.ok && readRes.items?.[0]) pushItems([readRes.items[0]]);
        else pushItems([hit]);
      }
    }
  } else if (channel === "v2ex") {
    const aiPattern = /(agent|claude|codex|openclaw|mcp|llm|ai|自动化|智能体|工作流)/i;
    for (const node of CRAWL_CONFIG.queries.v2exNodes) {
      const nodeRes = await runReach("v2ex", ["v2ex", "node", node, "--limit", String(limitPerQuery * 2)]);
      if (!nodeRes.ok) {
        console.warn(`[v2ex] node ${node} skipped (${nodeRes.error?.code}): ${nodeRes.error?.message}`);
        if (stopCodes.has(nodeRes.error?.code || "")) break;
        continue;
      }
      const hits = (nodeRes.items || []).filter((it) => aiPattern.test(`${it.title || ""} ${it.text || ""}`)).slice(0, limitPerQuery);
      for (const hit of hits) {
        if (!hit.url) continue;
        const readRes = await runReach("v2ex", ["v2ex", "read", hit.url]);
        if (readRes.ok && readRes.items?.[0]) pushItems([readRes.items[0]]);
      }
    }
  } else if (channel === "web") {
    for (const q of CRAWL_CONFIG.queries.web) {
      const searchRes = await runReach("web", ["web", "search", q, "--limit", String(limitPerQuery)]);
      if (!searchRes.ok) {
        console.warn(`[web] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (!hit.url) continue;
        const readRes = await runReach("web", ["web", "read", hit.url]);
        if (readRes.ok && readRes.items?.[0]?.text) pushItems([readRes.items[0]]);
        else pushItems([hit]);
      }
    }
  } else if (channel === "bilibili") {
    for (const q of CRAWL_CONFIG.queries.bilibili) {
      const searchRes = await runReach("bilibili", ["bilibili", "search", q, "--limit", String(limitPerQuery)]);
      if (!searchRes.ok) {
        console.warn(`[bilibili] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (!hit.url) continue;
        const subRes = await runReach("bilibili", ["bilibili", "subtitle", hit.url]);
        if (subRes.ok && subRes.items?.[0]?.text) {
          pushItems([{ ...hit, text: `${hit.text || ""}\n\n[字幕]\n${subRes.items[0].text}` }]);
        } else {
          pushItems([hit]);
        }
      }
    }
  } else if (channel === "youtube") {
    for (const q of CRAWL_CONFIG.queries.youtube) {
      const searchRes = await runReach("youtube", ["youtube", "search", q, "--limit", String(limitPerQuery)]);
      if (!searchRes.ok) {
        console.warn(`[youtube] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (!hit.url) continue;
        const subRes = await runReach("youtube", ["youtube", "subtitle", hit.url]);
        if (subRes.ok && subRes.items?.[0]?.text) {
          pushItems([{ ...hit, text: `${hit.text || ""}\n\n[Subtitles]\n${subRes.items[0].text}` }]);
        } else {
          pushItems([hit]);
        }
      }
    }
  }

  return collected;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const channelsArg = args.find((a) => a.startsWith("--channels="))?.split("=")[1];
  const limitArg = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "2");

  const channels = (
    channelsArg
      ? channelsArg.split(",").map((s) => s.trim())
      : [...CRAWL_CONFIG.phase1Channels]
  ).filter((c): c is NoLoginChannel =>
    (CRAWL_CONFIG.phase1Channels as readonly string[]).includes(c)
  );

  const apiKey = LLM_CONFIG.getApiKey();
  console.log(`[crawl] Model: ${LLM_CONFIG.model} (${LLM_CONFIG.provider}), Channels: ${channels.join(", ")}, DryRun: ${dryRun}`);

  // Fetch existing catalog for pre-LLM deduplication
  const catRes = await fetch(`${WORKER_CONFIG.baseUrl}/api/catalog`, {
    signal: AbortSignal.timeout(15_000),
  });
  const existingCatalog = catRes.ok
    ? ((await catRes.json()) as Array<{ id?: string; title?: string; link?: string | null; source?: { url?: string } }>)
    : [];

  const seenUrls = new Set(
    existingCatalog.map((i) => normalizeUrl(i.source?.url || i.link || null)).filter(Boolean)
  );
  const seenTitles = new Set(
    existingCatalog.map((i) => normalizeTitle(i.title)).filter((t) => t.length >= 6)
  );
  console.log(`[crawl] Loaded ${existingCatalog.length} existing catalog items for dedup.`);

  const rawPool: Array<{ channel: NoLoginChannel; item: ReachItem }> = [];
  for (const ch of channels) {
    console.log(`[crawl] Collecting from channel: ${ch}...`);
    const items = await collectChannelCandidates(ch, limitArg);
    for (const entry of items) {
      const urlKey = normalizeUrl(entry.item.url);
      const titleKey = normalizeTitle(entry.item.title);
      if ((urlKey && seenUrls.has(urlKey)) || (titleKey && titleKey.length >= 6 && seenTitles.has(titleKey))) {
        continue;
      }
      if (urlKey) seenUrls.add(urlKey);
      if (titleKey && titleKey.length >= 6) seenTitles.add(titleKey);
      rawPool.push(entry);
      if (rawPool.length >= CRAWL_CONFIG.maxItemsPerRun) break;
    }
    if (rawPool.length >= CRAWL_CONFIG.maxItemsPerRun) break;
  }

  console.log(`[crawl] ${rawPool.length} new candidate items after URL/title dedup. Structuring via OpenRouter...`);

  const ingestPayload: Array<{ usecase: Record<string, unknown>; detail: Record<string, unknown> }> = [];
  for (const { channel, item } of rawPool) {
    try {
      const structured = await structureWithLLM(apiKey, channel, item);
      if (!structured?.isValidUseCase || !structured.title || !structured.summary) {
        console.log(`  [skip] ${item.title?.slice(0, 50)} -> ${structured?.reason || "invalid/empty"}`);
        continue;
      }
      const category = (VALID_CATEGORIES as readonly string[]).includes(structured.category || "")
        ? structured.category!
        : "operations";
      const tools = Array.isArray(structured.tools) && structured.tools.length > 0 ? structured.tools : ["AI Agent"];
      const id = makeStableId(channel, item.url || item.title || String(Date.now()));
      const nowIso = new Date().toISOString();

      const usecase = {
        id,
        title: structured.title.trim(),
        summary: structured.summary.trim(),
        category,
        tools,
        link: item.url || null,
        source: {
          platform: channel,
          url: item.url || "",
          author: item.author || null,
          date: item.published_at || nowIso,
        },
        addedAt: nowIso,
        agents: {
          filter: tools,
          labels: tools,
          known: true,
        },
        accounts: 1,
        described: true,
        isLocal: true,
        crawlSource: "agent-reach",
      };

      const detail = {
        id,
        whatTheyDid: structured.whatTheyDid || "",
        howItWent: structured.howItWent || "",
        worthKnowing: structured.worthKnowing || "",
        prompt: structured.prompt || "",
        originalUrl: item.url || null,
      };

      ingestPayload.push({ usecase, detail });
      console.log(`  [ready] [${channel}] (${category}) ${usecase.title}`);
    } catch (err) {
      console.warn(`  [error] LLM failed for ${item.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[crawl] Structured ${ingestPayload.length} valid use cases.`);
  if (dryRun || ingestPayload.length === 0) {
    if (dryRun && ingestPayload.length > 0) {
      console.log("[dry-run] Sample item:", JSON.stringify(ingestPayload[0], null, 2));
    }
    return;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = WORKER_CONFIG.getIngestToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const ingestRes = await fetch(`${WORKER_CONFIG.baseUrl}/api/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify({ items: ingestPayload }),
    signal: AbortSignal.timeout(20_000),
  });
  const ingestJson = await ingestRes.json().catch(() => ({}));
  console.log("[crawl] Ingest response:", ingestRes.status, JSON.stringify(ingestJson));
}

main().catch((err) => {
  console.error("[crawl] Fatal:", err);
  process.exit(1);
});
