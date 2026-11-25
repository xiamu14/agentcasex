import { useState } from "react";
import {
  Bookmark,
  Check,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { CATEGORIES, GIVE_TO_AGENT_PROMPT } from "../constants";
import type { SpecialView, SyncStatus, TimeFilter } from "../types";
import { AgentBadge } from "./AgentBadge";
import { Logo } from "./Logo";

interface AgentCount {
  name: string;
  count: number;
}

interface SidebarProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  showOriginal: boolean;
  onToggleLanguage: () => void;
  onRefreshData: () => void;
  refreshing: boolean;
  syncStatus: SyncStatus | null;
  todayCount: number;
  savedCount: number;
  aiTradingCount: number;
  agentCounts: AgentCount[];
  categoryCounts: Record<string, number>;
  selectedAgent: string | null;
  selectedCategory: string | null;
  timeFilter: TimeFilter;
  specialView: SpecialView;
  onSelectAgent: (agent: string | null) => void;
  onSelectCategory: (cat: string | null) => void;
  onSelectToday: () => void;
  onSelectSpecial: (view: SpecialView) => void;
  onResetAll: () => void;
  onOpenSubscribe: () => void;
  onOpenSubmit: () => void;
  onOpenAbout: () => void;
}

export function Sidebar({
  theme,
  onToggleTheme,
  showOriginal,
  onToggleLanguage,
  onRefreshData,
  refreshing,
  syncStatus,
  todayCount,
  savedCount,
  aiTradingCount,
  agentCounts,
  categoryCounts,
  selectedAgent,
  selectedCategory,
  timeFilter,
  specialView,
  onSelectAgent,
  onSelectCategory,
  onSelectToday,
  onSelectSpecial,
  onResetAll,
  onOpenSubscribe,
  onOpenSubmit,
  onOpenAbout,
}: SidebarProps) {
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [copiedAgentPrompt, setCopiedAgentPrompt] = useState(false);

  const visibleAgents = showAllAgents ? agentCounts : agentCounts.slice(0, 6);

  async function handleGiveToAgent() {
    try {
      await navigator.clipboard.writeText(GIVE_TO_AGENT_PROMPT);
      setCopiedAgentPrompt(true);
      setTimeout(() => setCopiedAgentPrompt(false), 1800);
    } catch {}
  }

  return (
    <aside className="scroll-quiet flex w-full shrink-0 flex-col border-b border-dashed border-line px-5 py-6 lg:sticky lg:top-0 lg:h-dvh lg:w-[272px] lg:overflow-y-auto lg:border-r lg:border-b-0 xl:w-[288px]">
      {/* Logo */}
      <button
        type="button"
        onClick={onResetAll}
        className="w-fit text-left focus:outline-none"
        title="回到首页"
      >
        <Logo className="size-[41px] lg:size-[48px]" />
      </button>

      {/* Brand title + Theme toggle */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onResetAll}
          className="font-display text-[21px] font-bold tracking-tight text-text hover:opacity-80"
        >
          <span>agentcasex</span>
          <span className="text-faint">.ai</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            className="inline-flex size-8 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-faint hover:text-text"
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* Tagline */}
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
        <strong className="font-medium text-text">
          人们正在用 AI Agent 做的真实事情
        </strong>
        ，每天从全网持续扫描整理。来这里偷师一个好点子。
      </p>

      {/* Primary CTAs */}
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onOpenSubscribe}
          className="w-full rounded-lg bg-text px-3 py-2 text-[13.5px] font-medium text-bg transition-opacity hover:opacity-90"
        >
          每天早上获取 5 个用例
        </button>

        <button
          type="button"
          onClick={handleGiveToAgent}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-[13.5px] text-muted transition-colors hover:border-faint hover:text-text"
        >
          {copiedAgentPrompt ? (
            <>
              <Check className="size-3.5 text-signal" />
              <span className="text-signal">已复制提示词</span>
            </>
          ) : (
            <span>发给你的 Agent</span>
          )}
        </button>
      </div>

      {/* New Today badge */}
      <button
        type="button"
        onClick={onSelectToday}
        className={`mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
          timeFilter === "today"
            ? "bg-signal text-white"
            : "bg-signal-panel text-signal hover:opacity-90"
        }`}
      >
        <span className="flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${
              timeFilter === "today" ? "bg-white" : "bg-signal"
            }`}
          />
          <span>今日新增</span>
        </span>
        <span className="font-mono text-xs">{todayCount}</span>
      </button>

      {/* CATEGORIES section */}
      <div className="mt-6 border-t border-dashed border-line pt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-faint uppercase">
            分类 · CATEGORIES
          </h2>
          {selectedCategory && (
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              className="text-[11.5px] text-faint underline underline-offset-2 hover:text-text"
            >
              全部
            </button>
          )}
        </div>

        <ul className="mt-2.5 space-y-0.5">
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;
            return (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() => onSelectCategory(active ? null : cat.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                    active
                      ? "bg-text font-medium text-bg"
                      : "text-muted hover:bg-wash hover:text-text"
                  }`}
                >
                  <span className="truncate">{cat.label}</span>
                  <span
                    className={`ml-2 shrink-0 font-mono text-[11.5px] ${
                      active ? "text-bg/80" : "text-faint"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* AGENTS section */}
      <div className="mt-6 border-t border-dashed border-line pt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-faint uppercase">
            AI 代理 · AGENTS
          </h2>
          <button
            type="button"
            onClick={() => setShowAllAgents((v) => !v)}
            className="text-[11.5px] text-faint underline underline-offset-2 hover:text-text"
          >
            {showAllAgents ? "收起" : "全部代理"}
          </button>
        </div>

        <ul className="mt-2.5 space-y-0.5">
          {visibleAgents.map((ag) => {
            const active = selectedAgent === ag.name;
            const isOther = ag.name.toLowerCase().includes("other");
            return (
              <li key={ag.name}>
                <button
                  type="button"
                  onClick={() => onSelectAgent(active ? null : ag.name)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-text font-medium text-bg"
                      : "text-text hover:bg-wash"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <AgentBadge name={ag.name} isCustom={isOther} size="sm" />
                    <span className="truncate">
                      {isOther ? "其他 / 自定义" : ag.name}
                    </span>
                  </span>
                  <span
                    className={`font-mono text-[11.5px] ${
                      active ? "text-bg/80" : "text-faint"
                    }`}
                  >
                    {ag.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {agentCounts.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAllAgents((v) => !v)}
            className="mt-2 px-2 font-mono text-[11.5px] text-faint hover:text-text"
          >
            {showAllAgents ? "收起列表" : `显示全部 ${agentCounts.length} 个`}
          </button>
        )}
      </div>

      {/* COLLECTIONS section */}
      <div className="mt-6 border-t border-dashed border-line pt-5">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-faint uppercase">
          专题合集 · COLLECTIONS
        </h2>
        <ul className="mt-2.5 space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() =>
                onSelectSpecial(
                  specialView === "collection:ai-trading"
                    ? "none"
                    : "collection:ai-trading"
                )
              }
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                specialView === "collection:ai-trading"
                  ? "bg-text font-medium text-bg"
                  : "text-muted hover:bg-wash hover:text-text"
              }`}
            >
              <span>AI 自动交易与量化</span>
              <span
                className={`font-mono text-[11.5px] ${
                  specialView === "collection:ai-trading"
                    ? "text-bg/80"
                    : "text-faint"
                }`}
              >
                {aiTradingCount}
              </span>
            </button>
          </li>

          <li>
            <button
              type="button"
              onClick={() =>
                onSelectSpecial(specialView === "saved" ? "none" : "saved")
              }
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                specialView === "saved"
                  ? "bg-text font-medium text-bg"
                  : "text-muted hover:bg-wash hover:text-text"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Bookmark className="size-3.5" />
                <span>我的收藏</span>
              </span>
              <span
                className={`font-mono text-[11.5px] ${
                  specialView === "saved" ? "text-bg/80" : "text-faint"
                }`}
              >
                {savedCount}
              </span>
            </button>
          </li>
        </ul>
      </div>

      {/* Footer links */}
      <div className="mt-6 border-t border-dashed border-line pt-4 pb-2 font-mono text-[11px] text-faint">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            onClick={onOpenAbout}
            className="hover:text-text hover:underline"
          >
            关于本站
          </button>
          <a
            href="https://agentusecases.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text hover:underline"
          >
            原站 ↗
          </a>
          <a
            href="https://agentusecases.ai/feed.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text hover:underline"
          >
            RSS
          </a>
          <button
            type="button"
            onClick={onRefreshData}
            disabled={refreshing}
            className="inline-flex items-center gap-1 hover:text-text"
            title="从 agentusecases.ai 强制拉取最新数据"
          >
            <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "同步中" : "同步数据"}</span>
          </button>
        </div>
        <p className="mt-2 text-[10.5px] text-faint/80">
          {syncStatus
            ? `每 ${syncStatus.intervalMinutes} 分钟自动拉取${
                syncStatus.lastSyncAt
                  ? ` · 上次 ${new Date(syncStatus.lastSyncAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""
              }`
            : "本地简体中文镜像 · 实时复用原站接口数据"}
        </p>
      </div>
    </aside>
  );
}
