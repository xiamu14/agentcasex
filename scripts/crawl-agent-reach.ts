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
      maxBuffer: 6 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim()) as ReachResponse;
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout.trim()) as ReachResponse;
      } catch {
        // fall through to EXEC_ERROR
      }
    }
    const msg = e.message || String(err);
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

const KNOWN_AGENTS = [
  "Claude Code",
  "Claude",
  "Claude Cowork",
  "Claude in Chrome",
  "Claude computer use",
  "ChatGPT",
  "ChatGPT Agent",
  "ChatGPT Dots",
  "Operator",
  "Codex",
  "Gemini",
  "Meta Muse",
  "Muse",
  "Grok Bot",
  "Perplexity Comet",
  "Manus",
  "OpenClaw",
  "Alexa+",
  "Dots",
  "Hermes Agent",
  "Hermes",
  "Microsoft Scout",
  "Devin",
  "Replit Agent",
  "Cursor",
  "GitHub Copilot",
  "n8n",
  "Zapier Agents",
  "Make",
  "Lindy",
];

const KNOWN_AGENT_MAP = new Map(KNOWN_AGENTS.map((a) => [a.toLowerCase(), a]));

function extractAgentFilters(tools: string[]): { filter: string[]; known: boolean } {
  const matched = new Set<string>();
  for (const t of tools) {
    const canonical = KNOWN_AGENT_MAP.get(t.trim().toLowerCase());
    if (canonical) matched.add(canonical);
  }
  if (matched.size > 0) {
    return { filter: Array.from(matched), known: true };
  }
  return { filter: ["Other or custom"], known: false };
}

function makeStableId(platform: string, url: string): string {
  const hash = crypto.createHash("sha1").update(normalizeUrl(url) || url).digest("hex").slice(0, 12);
  return `ar-${platform}-${hash}`;
}

function pickRotatingSlice<T>(arr: readonly T[], count: number, seedOffset = 0): T[] {
  if (arr.length <= count) return [...arr];
  const dayOfYear = Math.floor(Date.now() / 86_400_000) + seedOffset;
  const start = (dayOfYear * count) % arr.length;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(arr[(start + i) % arr.length]);
  }
  return out;
}

function extractJsonObject(raw: string): StructuredExtraction | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as StructuredExtraction;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1)) as StructuredExtraction;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function structureWithLLM(
  apiKey: string,
  channel: string,
  item: ReachItem
): Promise<{ status: "ok"; data: StructuredExtraction } | { status: "skip"; reason: string }> {
  const bodyText = (item.text || "").trim().slice(0, 5000);
  if (bodyText.length < 80) {
    return { status: "skip", reason: `too_short(${bodyText.length})` };
  }

  const systemPrompt = `你是 agentcases.ai 的 AI Agent 应用案例编辑。请判断输入内容是否是一个「真实、可复现的 AI Agent 实战应用案例、真实使用经验或自动化工作流」（排除纯概念科普、空泛观点争论、纯招聘广告、无任何实操细节的软件宣传）。
如果是有效案例，请提炼并输出为自然、精炼的简体中文 JSON；如果不是，返回 {"isValidUseCase": false, "reason": "..."}。

可选 category（必须严格选其一）: ${VALID_CATEGORIES.join(", ")}

仅输出合法 JSON（不要 markdown 代码块或额外解释），结构如下：
{
  "isValidUseCase": true,
  "title": "不超过36字的中文标题，直击场景与效果",
  "summary": "1-2句中文摘要，说明用了什么 Agent 做了什么事、结果如何",
  "category": "software",
  "tools": ["Claude Code", "MCP"], // 最多保留 5 个最核心的工具或框架标签
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
      reasoning: { effort: LLM_CONFIG.reasoningEffort },
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
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const rawContent = data.choices?.[0]?.message?.content?.trim() || "";
  if (!rawContent) {
    return { status: "skip", reason: `empty_llm_content(finish=${data.choices?.[0]?.finish_reason || "?"})` };
  }

  const parsed = extractJsonObject(rawContent);
  if (!parsed) {
    return { status: "skip", reason: `json_parse_error(${rawContent.slice(0, 60).replace(/\s+/g, " ")})` };
  }
  if (!parsed.isValidUseCase || !parsed.title || !parsed.summary) {
    return { status: "skip", reason: parsed.reason || "rejected_by_llm" };
  }
  return { status: "ok", data: parsed };
}

async function collectChannelCandidates(
  channel: NoLoginChannel,
  limitPerQuery: number,
  allQueries: boolean,
  seenUrls: Set<string>,
  seenTitles: Set<string>
): Promise<{ items: Array<{ channel: NoLoginChannel; item: ReachItem }>; rawCount: number }> {
  const collected: Array<{ channel: NoLoginChannel; item: ReachItem }> = [];
  let rawCount = 0;
  const stopCodes = new Set(["RATE_LIMITED", "PLATFORM_BLOCKED", "NEED_LOGIN", "NEED_SETUP", "TIMEOUT"]);
  const maxForChannel = CRAWL_CONFIG.maxCandidatesPerChannel;

  const tryPush = (it?: ReachItem): boolean => {
    if (!it?.url || !it?.title) return false;
    rawCount++;
    const urlKey = normalizeUrl(it.url);
    const titleKey = normalizeTitle(it.title);
    if ((urlKey && seenUrls.has(urlKey)) || (titleKey && titleKey.length >= 6 && seenTitles.has(titleKey))) {
      return false;
    }
    if (urlKey) seenUrls.add(urlKey);
    if (titleKey && titleKey.length >= 6) seenTitles.add(titleKey);
    collected.push({ channel, item: it });
    return true;
  };

  if (channel === "web") {
    const queries = allQueries
      ? [...CRAWL_CONFIG.queries.web]
      : pickRotatingSlice(CRAWL_CONFIG.queries.web, CRAWL_CONFIG.queriesPerChannelPerRun.web);
    for (const q of queries) {
      if (collected.length >= maxForChannel) break;
      const searchRes = await runReach("web", ["web", "search", q, "--limit", String(limitPerQuery)]);
      if (!searchRes.ok) {
        console.warn(`[web] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (collected.length >= maxForChannel) break;
        if (!hit.url || !hit.title) continue;
        // Pre-check dedup before spending an extra web read call
        const urlKey = normalizeUrl(hit.url);
        if (urlKey && seenUrls.has(urlKey)) {
          rawCount++;
          continue;
        }
        if ((hit.text || "").trim().length >= 500) {
          tryPush(hit);
        } else {
          const readRes = await runReach("web", ["web", "read", hit.url]);
          if (readRes.ok && readRes.items?.[0]?.text) tryPush(readRes.items[0]);
          else tryPush(hit);
        }
      }
    }
  } else if (channel === "v2ex") {
    const aiPattern = /(agent|claude|codex|openclaw|mcp|llm|ai|自动化|智能体|工作流|提示词|cursor)/i;
    const nodes = allQueries
      ? [...CRAWL_CONFIG.queries.v2exNodes]
      : pickRotatingSlice(CRAWL_CONFIG.queries.v2exNodes, CRAWL_CONFIG.queriesPerChannelPerRun.v2ex);
    for (const node of nodes) {
      if (collected.length >= maxForChannel) break;
      const args =
        node === "hot"
          ? ["v2ex", "hot", "--limit", "20"]
          : ["v2ex", "node", node, "--limit", String(Math.max(limitPerQuery, 12))];
      const nodeRes = await runReach("v2ex", args);
      if (!nodeRes.ok) {
        console.warn(`[v2ex] ${node} skipped (${nodeRes.error?.code}): ${nodeRes.error?.message}`);
        if (stopCodes.has(nodeRes.error?.code || "")) break;
        continue;
      }
      const hits = (nodeRes.items || []).filter((it) => aiPattern.test(`${it.title || ""} ${it.text || ""}`));
      for (const hit of hits) {
        if (collected.length >= maxForChannel) break;
        if (!hit.url) continue;
        if (seenUrls.has(normalizeUrl(hit.url))) {
          rawCount++;
          continue;
        }
        const readRes = await runReach("v2ex", ["v2ex", "read", hit.url]);
        if (readRes.ok && readRes.items?.[0]) tryPush(readRes.items[0]);
      }
    }
  } else if (channel === "bilibili") {
    const queries = allQueries
      ? [...CRAWL_CONFIG.queries.bilibili]
      : pickRotatingSlice(CRAWL_CONFIG.queries.bilibili, CRAWL_CONFIG.queriesPerChannelPerRun.bilibili);
    for (const q of queries) {
      if (collected.length >= maxForChannel) break;
      const searchRes = await runReach("bilibili", ["bilibili", "search", q, "--limit", String(Math.min(limitPerQuery, 6))]);
      if (!searchRes.ok) {
        console.warn(`[bilibili] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (collected.length >= maxForChannel) break;
        if (!hit.url || seenUrls.has(normalizeUrl(hit.url))) {
          rawCount++;
          continue;
        }
        const subRes = await runReach("bilibili", ["bilibili", "subtitle", hit.url]);
        if (subRes.ok && subRes.items?.[0]?.text && subRes.items[0].text.length >= 120) {
          tryPush({ ...hit, text: `${hit.text || ""}\n\n[字幕]\n${subRes.items[0].text}` });
        } else {
          const readRes = await runReach("bilibili", ["bilibili", "read", hit.url]);
          if (readRes.ok && readRes.items?.[0]) tryPush(readRes.items[0]);
          else tryPush(hit);
        }
      }
    }
  } else if (channel === "youtube") {
    const queries = allQueries
      ? [...CRAWL_CONFIG.queries.youtube]
      : pickRotatingSlice(CRAWL_CONFIG.queries.youtube, CRAWL_CONFIG.queriesPerChannelPerRun.youtube);
    for (const q of queries) {
      if (collected.length >= maxForChannel) break;
      const searchRes = await runReach("youtube", ["youtube", "search", q, "--limit", String(Math.min(limitPerQuery, 5))]);
      if (!searchRes.ok) {
        console.warn(`[youtube] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (collected.length >= maxForChannel) break;
        if (!hit.url || seenUrls.has(normalizeUrl(hit.url))) {
          rawCount++;
          continue;
        }
        const subRes = await runReach("youtube", ["youtube", "subtitle", hit.url]);
        if (subRes.ok && subRes.items?.[0]?.text && subRes.items[0].text.length >= 120) {
          tryPush({ ...hit, text: `${hit.text || ""}\n\n[Subtitles]\n${subRes.items[0].text}` });
        } else {
          const readRes = await runReach("youtube", ["youtube", "read", hit.url]);
          if (readRes.ok && readRes.items?.[0]) tryPush(readRes.items[0]);
          else tryPush(hit);
        }
      }
    }
  } else if (channel === "github") {
    const queries = allQueries
      ? [...CRAWL_CONFIG.queries.github]
      : pickRotatingSlice(CRAWL_CONFIG.queries.github, CRAWL_CONFIG.queriesPerChannelPerRun.github);
    for (const q of queries) {
      if (collected.length >= maxForChannel) break;
      const searchRes = await runReach("github", ["github", "search", q, "--limit", String(Math.min(limitPerQuery, 4))]);
      if (!searchRes.ok) {
        console.warn(`[github] search skipped (${searchRes.error?.code}): ${searchRes.error?.message}`);
        if (stopCodes.has(searchRes.error?.code || "")) break;
        continue;
      }
      for (const hit of searchRes.items || []) {
        if (collected.length >= maxForChannel) break;
        if (!hit.url || seenUrls.has(normalizeUrl(hit.url))) {
          rawCount++;
          continue;
        }
        const readRes = await runReach("github", ["github", "read", hit.url]);
        if (readRes.ok && readRes.items?.[0]) tryPush(readRes.items[0]);
        else tryPush(hit);
      }
    }
  }

  return { items: collected, rawCount };
}

async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allQueries = args.includes("--all-queries");
  const channelsArg = args.find((a) => a.startsWith("--channels="))?.split("=")[1];
  const limitArg = Number(
    args.find((a) => a.startsWith("--limit="))?.split("=")[1] || CRAWL_CONFIG.defaultLimitPerQuery
  );

  const channels = (
    channelsArg
      ? channelsArg.split(",").map((s) => s.trim())
      : [...CRAWL_CONFIG.phase1Channels]
  ).filter((c): c is NoLoginChannel =>
    (CRAWL_CONFIG.phase1Channels as readonly string[]).includes(c)
  );

  const apiKey = LLM_CONFIG.getApiKey();
  console.log(
    `[crawl] Model: ${LLM_CONFIG.model} (${LLM_CONFIG.provider}), Channels: ${channels.join(", ")}, Limit/query: ${limitArg}, AllQueries: ${allQueries}, DryRun: ${dryRun}`
  );

  const catRes = await fetchWithRetry(`${WORKER_CONFIG.baseUrl}/api/catalog`, {
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
  const channelStats: Record<string, { raw: number; deduped: number; valid: number }> = {};

  for (const ch of channels) {
    if (rawPool.length >= CRAWL_CONFIG.maxCandidatesPerRun) break;
    console.log(`[crawl] Collecting from channel: ${ch}...`);
    const { items, rawCount } = await collectChannelCandidates(
      ch,
      limitArg,
      allQueries,
      seenUrls,
      seenTitles
    );
    const remaining = CRAWL_CONFIG.maxCandidatesPerRun - rawPool.length;
    const accepted = items.slice(0, remaining);
    channelStats[ch] = { raw: rawCount, deduped: accepted.length, valid: 0 };
    rawPool.push(...accepted);
  }

  console.log(`[crawl] ${rawPool.length} new candidate items after URL/title dedup. Structuring via OpenRouter...`);

  const ingestPayload: Array<{ usecase: Record<string, unknown>; detail: Record<string, unknown> }> = [];
  for (const { channel, item } of rawPool) {
    try {
      const result = await structureWithLLM(apiKey, channel, item);
      if (result.status === "skip") {
        console.log(`  [skip] [${channel}] ${item.title?.slice(0, 48)} -> ${result.reason}`);
        continue;
      }
      const structured = result.data;
      const category = (VALID_CATEGORIES as readonly string[]).includes(structured.category || "")
        ? structured.category!
        : "operations";
      const tools =
        Array.isArray(structured.tools) && structured.tools.length > 0
          ? structured.tools.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
          : ["AI Agent"];
      const id = makeStableId(channel, item.url || item.title || String(Date.now()));
      const nowIso = new Date().toISOString();

      const usecase = {
        id,
        title: structured.title!.trim().slice(0, 60),
        summary: structured.summary!.trim().slice(0, 260),
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
          ...extractAgentFilters(tools),
          labels: tools,
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
      if (channelStats[channel]) channelStats[channel].valid++;
      console.log(`  [ready] [${channel}] (${category}) ${usecase.title}`);
    } catch (err) {
      console.warn(`  [error] LLM failed for ${item.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("[crawl] Channel funnel stats:", JSON.stringify(channelStats));
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

  const ingestRes = await fetchWithRetry(`${WORKER_CONFIG.baseUrl}/api/ingest`, {
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
