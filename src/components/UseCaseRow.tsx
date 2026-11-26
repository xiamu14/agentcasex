import { useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import {
  getAgentStyle,
  PLATFORM_LABELS,
  formatMonthZh,
  isWithinDays,
} from "../constants";
import type { UseCase } from "../types";
import { AgentBadge } from "./AgentBadge";
import { ShareMenu } from "./ShareMenu";

interface UseCaseRowProps {
  item: UseCase;
  votes: number;
  voted: boolean;
  saved: boolean;
  refDate: Date;
  tr: (text?: string | null) => string;
  onSelect: (item: UseCase) => void;
  onVote: (id: string) => void;
  onSave: (id: string) => void;
  onSelectAgent: (agent: string) => void;
}

export function UseCaseRow({
  item,
  votes,
  voted,
  saved,
  refDate,
  tr,
  onSelect,
  onVote,
  onSave,
  onSelectAgent,
}: UseCaseRowProps) {
  const [bumping, setBumping] = useState(false);

  const primaryAgent = item.agents?.labels?.[0] || item.tools?.[0] || null;
  const isCustom = !item.agents?.known || !primaryAgent;
  const isNew = isWithinDays(item.addedAt, 7, refDate);
  const platformName = PLATFORM_LABELS[item.source?.platform] || item.source?.platform || "网页";
  const monthText = formatMonthZh(item.source?.date || item.addedAt);

  const title = tr(item.title);
  const summary = tr(item.summary);

  function handleVoteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setBumping(true);
    onVote(item.id);
    window.setTimeout(() => setBumping(false), 300);
  }

  return (
    <li className="group relative border-b border-dashed border-line last:border-b-0">
      <div
        onClick={() => onSelect(item)}
        className="flex cursor-pointer items-start justify-between gap-3 px-4 py-4 transition-colors hover:bg-wash sm:px-6"
      >
        {/* Left badge + content */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 shrink-0">
            <AgentBadge name={primaryAgent} isCustom={isCustom} size="md" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold text-text">
              <a
                href={`/use-case/${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
                className="hover:underline underline-offset-4"
              >
                {title}
              </a>
            </h3>

            <p className="mt-1 line-clamp-3 text-[13.5px] leading-relaxed text-muted">
              {summary}
            </p>

            {/* Metadata row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11.5px] text-faint">
              {item.agents?.known && item.agents?.labels?.length > 0 ? (
                <>
                  {item.agents.labels.slice(0, 5).map((ag) => {
                    const { color } = getAgentStyle(ag);
                    return (
                      <button
                        key={ag}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAgent(ag);
                        }}
                        className="inline-flex items-center gap-1.5 text-text hover:underline"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: color, boxShadow: "0 0 0 1px rgba(0,0,0,0.18)" }}
                        />
                        <span>{ag}</span>
                      </button>
                    );
                  })}
                  {item.agents.labels.length > 5 && (
                    <span className="text-[11px] text-faint">
                      +{item.agents.labels.length - 5}
                    </span>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAgent("Other or custom");
                  }}
                  className="text-muted hover:text-text hover:underline"
                >
                  自定义 Agent
                </button>
              )}

              {isNew && (
                <span className="font-sans text-[11px] font-medium text-signal">
                  最新
                </span>
              )}

              {item.accounts > 1 && (
                <>
                  <span>·</span>
                  <span>{item.accounts} 个实例</span>
                </>
              )}

              <span>·</span>
              <span>
                {platformName}
                {item.source?.score ? ` ${item.source.score}` : ""}
              </span>

              {monthText && (
                <>
                  <span>·</span>
                  <span>{monthText}</span>
                </>
              )}

              {item.isLocal && (
                <span className="rounded bg-signal-panel px-1.5 py-0.5 text-[10px] text-signal">
                  本地投稿
                </span>
              )}
            </div>

            {/* Action pills */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item);
                }}
                className="inline-flex min-h-8 items-center rounded-md border border-line bg-bg px-2.5 text-[12px] font-medium text-text transition-colors hover:border-faint"
              >
                查看详情
              </button>
              {(item.source?.url || item.link) && (
                <a
                  href={item.source?.url || item.link || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-bg px-2.5 text-[12px] font-medium text-text transition-colors hover:border-faint"
                >
                  <span>阅读原文</span>
                  <ExternalLink className="size-3" />
                </a>
              )}
              <ShareMenu id={item.id} title={title} />
            </div>
          </div>
        </div>

        {/* Right vote & save buttons */}
        <div className="relative flex shrink-0 flex-col items-center gap-1 sm:flex-row">
          <button
            type="button"
            aria-pressed={voted}
            aria-label={`赞一个：${title}`}
            onClick={handleVoteClick}
            className={`flex size-11 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
              voted
                ? "bg-signal-panel text-signal"
                : "text-text hover:bg-wash-strong"
            }`}
          >
            <svg
              viewBox="0 0 12 12"
              className={`size-3 fill-current ${bumping ? "vote-bump" : ""}`}
              aria-hidden="true"
            >
              <path d="M6 2 11 10H1L6 2Z" />
            </svg>
            {votes > 0 && (
              <span className="font-mono text-[11px] leading-none font-medium">
                {votes}
              </span>
            )}
          </button>

          <button
            type="button"
            aria-pressed={saved}
            aria-label={`收藏：${title}`}
            onClick={(e) => {
              e.stopPropagation();
              onSave(item.id);
            }}
            className={`flex size-11 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
              saved
                ? "bg-signal-panel text-signal"
                : "text-muted hover:bg-wash-strong hover:text-text"
            }`}
          >
            <Bookmark
              className="size-3.5"
              fill={saved ? "currentColor" : "none"}
            />
            <span className="text-[10px] leading-none">
              {saved ? "已收藏" : "收藏"}
            </span>
          </button>
        </div>
      </div>
    </li>
  );
}
