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
  maxTokens: 1800,
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

export type NoLoginChannel = "github" | "v2ex" | "web" | "bilibili" | "youtube";

export const CRAWL_CONFIG = {
  phase1Channels: ["github", "v2ex", "web", "bilibili", "youtube"] as readonly NoLoginChannel[],
  // Respect agent-reach rule: at least 10s between searches on the same platform
  minPlatformIntervalMs: 11_000,
  commandTimeoutMs: 45_000,
  maxItemsPerRun: 15,
  queries: {
    github: [
      "ai agent workflow automation",
      "claude code mcp automation",
      "openclaw agent use case",
    ],
    v2exNodes: ["python", "programmer", "create"],
    web: [
      "real world AI agent automation workflow case study",
      "Claude Code OpenClaw real use case prompt",
    ],
    bilibili: [
      "AI Agent 自动化 工作流 实战",
      "Claude Code OpenClaw 案例",
    ],
    youtube: [
      "AI agent real workflow automation case study",
      "Claude Code real world automation",
    ],
  },
} as const;
