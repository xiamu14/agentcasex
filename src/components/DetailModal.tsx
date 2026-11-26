import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { CATEGORY_MAP, PLATFORM_LABELS, formatMonthZh } from "../constants";
import { useAnimeAsync } from "../hooks/useAnimeAsync";
import type { UseCase, UseCaseDetail } from "../types";
import { AgentBadge } from "./AgentBadge";
import { ShareMenu } from "./ShareMenu";

interface DetailModalProps {
  item: UseCase | null;
  prevItem: UseCase | null;
  nextItem: UseCase | null;
  votes: number;
  voted: boolean;
  saved: boolean;
  tr: (text?: string | null) => string;
  queueTranslate: (texts: (string | null | undefined)[]) => void;
  onClose: () => void;
  onSelect: (item: UseCase) => void;
  onVote: (id: string) => void;
  onSave: (id: string) => void;
  onSelectCategory: (cat: string) => void;
  onSelectAgent: (agent: string) => void;
}

export function DetailModal({
  item,
  prevItem,
  nextItem,
  votes,
  voted,
  saved,
  tr,
  queueTranslate,
  onClose,
  onSelect,
  onVote,
  onSave,
  onSelectCategory,
  onSelectAgent,
}: DetailModalProps) {
  const [detail, setDetail] = useState<UseCaseDetail | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const { showLoading, isPending, start, finish } = useAnimeAsync({
    delay: 180,
    period: 360,
  });

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    start();
    setDetail(null);
    setCopiedPrompt(false);

    queueTranslate([item.title, item.summary]);

    fetch(`/api/detail/${encodeURIComponent(item.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data: UseCaseDetail | null) => {
        if (cancelled) return;
        if (data) {
          await Promise.resolve(
            queueTranslate([
              data.whatTheyDid,
              data.howItWent,
              data.worthKnowing,
              data.prompt,
            ])
          );
        }
        if (cancelled) return;
        finish(() => {
          if (cancelled) return;
          setDetail(data);
        });
      })
      .catch(() => {
        if (!cancelled) finish();
      });

    return () => {
      cancelled = true;
    };
  }, [item, queueTranslate, start, finish]);

  useEffect(() => {
    if (!item) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && prevItem) onSelect(prevItem);
      else if (e.key === "ArrowRight" && nextItem) onSelect(nextItem);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item, prevItem, nextItem, onClose, onSelect]);

  if (!item) return null;

  const cat = CATEGORY_MAP[item.category];
  const title = tr(item.title);
  const summary = tr(item.summary);
  const whatTheyDid = tr(detail?.whatTheyDid);
  const howItWent = tr(detail?.howItWent);
  const worthKnowing = tr(detail?.worthKnowing);
  const promptText = tr(detail?.prompt);
  const originalUrl = detail?.originalUrl || item.link || item.source?.url;
  const platformName = PLATFORM_LABELS[item.source?.platform] || item.source?.platform || "网页";

  async function handleCopyPrompt() {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1600);
    } catch {}
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[3px] sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl"
      >
        {/* Scrollable body */}
        <div className="relative flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="absolute top-5 right-5 inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-wash hover:text-text"
          >
            <X className="size-4" />
          </button>

          {/* Category eyebrow */}
          {cat && (
            <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
              <button
                type="button"
                onClick={() => {
                  onSelectCategory(cat.id);
                  onClose();
                }}
                className="hover:text-text hover:underline"
              >
                {cat.label}
              </button>
            </p>
          )}

          {/* Title */}
          <h2 className="mt-2 pr-8 font-display text-[22px] leading-snug font-bold text-text sm:text-[25px]">
            {title}
          </h2>

          {/* Summary */}
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
            {summary}
          </p>

          {/* Tools used */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>使用工具</span>
            {item.agents?.labels?.length > 0 ? (
              item.agents.labels.map((ag) => (
                <button
                  key={ag}
                  type="button"
                  onClick={() => {
                    onSelectAgent(ag);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1 text-[12.5px] font-medium text-text transition-colors hover:border-faint"
                >
                  <AgentBadge name={ag} size="xs" />
                  <span>{ag}</span>
                </button>
              ))
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-2 py-1 text-[12.5px] text-muted">
                自定义 Agent
              </span>
            )}
            <span className="font-mono text-[11.5px] text-faint">
              · {platformName} · {formatMonthZh(item.source?.date || item.addedAt)}
            </span>
          </div>

          <div className="my-5 border-t border-dashed border-line" />

          {/* Detailed sections */}
          {showLoading ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="inline-flex size-2 animate-pulse rounded-full bg-signal" />
                <span>加载中...</span>
              </div>
              <div className="space-y-2 animate-pulse">
                <div className="h-3 w-24 rounded bg-wash-strong" />
                <div className="h-3.5 w-full rounded bg-wash" />
                <div className="h-3.5 w-5/6 rounded bg-wash" />
              </div>
            </div>
          ) : isPending ? null : (
            <dl className="space-y-4 text-[14px] leading-relaxed">
              {whatTheyDid && (
                <div>
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                    他们做了什么 · WHAT THEY DID
                  </dt>
                  <dd className="mt-1.5 text-text">{whatTheyDid}</dd>
                </div>
              )}

              {howItWent && (
                <div>
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                    实际效果如何 · HOW IT WENT
                  </dt>
                  <dd className="mt-1.5 text-text">{howItWent}</dd>
                </div>
              )}

              {worthKnowing && (
                <div>
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
                    值得注意 · WORTH KNOWING
                  </dt>
                  <dd className="mt-1.5 text-text">{worthKnowing}</dd>
                </div>
              )}
            </dl>
          )}

          {/* Try it yourself prompt box */}
          {promptText && (
            <div className="mt-5 rounded-xl border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13.5px] font-medium text-text">
                  亲自试一试{" "}
                  <span className="font-normal text-faint">
                    (直接复制给你的 AI Agent)
                  </span>
                </p>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-bg px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:border-faint hover:text-text"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="size-3 text-signal" />
                      <span className="text-signal">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>复制提示词</span>
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-text">
                {promptText}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {originalUrl && (
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-lg border border-transparent bg-text px-3.5 text-[13.5px] font-medium text-bg transition-opacity hover:opacity-90"
              >
                <span>阅读原文</span>
                <ExternalLink className="size-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={() => onVote(item.id)}
              className={`inline-flex h-[38px] items-center justify-center gap-1.5 rounded-lg border px-3.5 text-[13.5px] font-medium transition-colors ${
                voted
                  ? "border-signal bg-signal-panel text-signal"
                  : "border-line text-muted hover:border-faint hover:text-text"
              }`}
            >
              <svg viewBox="0 0 12 12" className="size-2.5 fill-current">
                <path d="M6 2 11 10H1L6 2Z" />
              </svg>
              <span>赞一个{votes > 0 ? ` ${votes}` : ""}</span>
            </button>

            <ShareMenu id={item.id} title={title} size="md" />
          </div>
        </div>

        {/* Sticky modal footer navigation */}
        <div className="flex items-center justify-between gap-2 border-t border-line bg-bg px-4 py-3 sm:px-6">
          <button
            type="button"
            disabled={!prevItem}
            onClick={() => prevItem && onSelect(prevItem)}
            className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-35"
          >
            <span>←</span>
            <span>上一条</span>
          </button>

          <button
            type="button"
            disabled={!nextItem}
            onClick={() => nextItem && onSelect(nextItem)}
            className="flex min-w-0 max-w-[48%] items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-35"
          >
            <span className="shrink-0">下一条</span>
            {nextItem && (
              <span className="hidden truncate font-medium text-text sm:inline">
                {tr(nextItem.title)}
              </span>
            )}
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
