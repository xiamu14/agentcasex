/**
 * Central configuration for agentcases.ai (single source of truth).
 * All LLM, upstream, Worker, and agent-reach crawl settings live here.
 * Secrets (API keys, tokens) are read from environment variables (injected via Infisical).
 */

export const LLM_CONFIG = {
  provider: "openrouter",
  apiBaseUrl: "https://openrouter.ai/api/v1",
  chatCompletionsUrl: "https://openrouter.ai/api/v1/chat/completions",
  model: "z-ai/glm-5.3",
  apiKeyEnv: "OPENROUTER_API_KEY",
  temperature: 0.2,
  maxTokens: 4500,
  reasoningEffort: "low",
  getApiKey(): string {
    const key = process.env[this.apiKeyEnv]?.trim();
    if (!key) {
      throw new Error(
        `Missing ${this.apiKeyEnv} in environment. Run with: infisical run --env=dev -- <command>`
      );
    }
    return key;
  },
} as const;

export const WORKER_CONFIG = {
  baseUrl: process.env.CF_WORKER_URL || "https://agentcasex-api.framer02.workers.dev",
  ingestTokenEnv: "INGEST_TOKEN",
  getIngestToken(): string | undefined {
    return process.env[this.ingestTokenEnv]?.trim() || undefined;
  },
} as const;

export const UPSTREAM_CONFIG = {
  url: "https://agentusecases.ai",
  coexistWithSelfCrawl: true,
} as const;

export const VALID_CATEGORIES = [
  "money",
  "life",
  "shopping",
  "travel",
  "operations",
  "growth",
  "research",
  "creative",
  "software",
  "games",
  "science",
] as const;

export type NoLoginChannel = "web" | "v2ex" | "bilibili" | "youtube" | "github";

export const CRAWL_CONFIG = {
  // Ordered by highest use-case yield first
  phase1Channels: ["web", "v2ex", "bilibili", "youtube", "github"] as readonly NoLoginChannel[],
  // Respect agent-reach rule: at least 10s between searches on the same platform
  minPlatformIntervalMs: 11_000,
  commandTimeoutMs: 45_000,
  defaultLimitPerQuery: 10,
  maxCandidatesPerChannel: 16,
  maxCandidatesPerRun: 45,
  queriesPerChannelPerRun: {
    web: 2,
    v2ex: 5,
    bilibili: 3,
    youtube: 2,
    github: 1,
  },
  queries: {
    web: [
      'site:reddit.com/r/ClaudeAI "how I use" OR "workflow" OR "automate"',
      'site:reddit.com/r/AIAgents "use case" OR "automated" OR "built an agent"',
      'site:dev.to "Claude Code" OR "OpenClaw" workflow automation',
      'site:news.ycombinator.com "Show HN" AI agent automation workflow',
      '"Claude Code" real world automation case study prompt',
      '"OpenClaw" OR "n8n" AI agent automated my workflow',
      '"voice agent" OR "Vapi" OR "Twilio" automated phone calls real case',
      '"polymarket" OR "trading" AI agent multi-agent real results',
      'site:mp.weixin.qq.com OR site:juejin.cn "Claude Code" OR "OpenClaw" 实战 案例',
      '"browser automation" OR "Playwright" AI agent scraped booked automated',
    ],
    v2exNodes: ["hot", "python", "programmer", "create", "share", "apple"],
    bilibili: [
      "Claude Code 实战 案例 工作流",
      "OpenClaw 自动化 案例 教程",
      "n8n AI Agent 自动化工作流 实战",
      "AI智能体 自动化 效率 实战",
    ],
    youtube: [
      "Claude Code real world workflow automation",
      "OpenClaw AI agent automation use case",
      "n8n AI agent real business workflow",
    ],
    github: [
      '"how I use claude code" OR "my claude code workflow"',
      '"openclaw" automated workflow case study',
    ],
  },
} as const;
