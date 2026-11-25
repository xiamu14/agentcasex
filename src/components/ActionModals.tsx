import { useState } from "react";
import { Check, X } from "lucide-react";
import { CATEGORIES, AGENT_PALETTE } from "../constants";
import type { CandidateCollection, UseCase } from "../types";

interface SubscribeModalProps {
  open: boolean;
  source?: string;
  hasPendingDetail?: boolean;
  onClose: () => void;
  onSkipToDetail?: () => void;
}

export function SubscribeModal({
  open,
  source = "sidebar",
  hasPendingDetail = false,
  onClose,
  onSkipToDetail,
}: SubscribeModalProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [mode, setMode] = useState<"resend" | "local">("local");
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(d.error || "订阅失败");
      }
      if (d.mode === "resend") setMode("resend");
      localStorage.setItem("auc-subscribed", "1");
      setStatus("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "订阅失败");
      setStatus("error");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-line bg-bg p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-wash hover:text-text"
        >
          <X className="size-4" />
        </button>

        {status === "done" ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-signal-panel text-signal">
              <Check className="size-5" />
            </div>
            <h3 className="mt-3 font-display text-lg font-bold text-text">
              订阅成功
            </h3>
            <p className="mt-1.5 text-sm text-muted">
              {mode === "resend"
                ? "欢迎邮件已发送至你的邮箱，明天早上 8:00 起将为你推送 5 个精选 AI Agent 用例！"
                : "已记录订阅状态。每天早上 5 个精选 AI Agent 案例与提示词灵感！"}
            </p>
            <button
              type="button"
              onClick={hasPendingDetail && onSkipToDetail ? onSkipToDetail : onClose}
              className="mt-5 rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg"
            >
              {hasPendingDetail ? "继续查看案例 →" : "返回浏览"}
            </button>
          </div>
        ) : (
          <>
            <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
              每日精选 · DAILY DIGEST
            </p>
            <h3 className="mt-1.5 font-display text-xl font-bold text-text">
              每天早上获取 5 个 AI Agent 实战用例
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              每个用例都附带可直接复用的提示词。每天一封邮件，无垃圾广告，随时退订。
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="输入你的邮箱地址..."
                className="w-full rounded-lg border border-line bg-bg px-3.5 py-2.5 text-sm text-text placeholder:text-faint focus:border-text focus:outline-none"
              />
              {error && <p className="text-xs text-danger">{error}</p>}
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded-lg bg-text py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {status === "sending" ? "提交中..." : "免费订阅"}
              </button>
              {hasPendingDetail && onSkipToDetail && (
                <button
                  type="button"
                  onClick={onSkipToDetail}
                  className="w-full py-1.5 text-center text-xs text-faint hover:text-text"
                >
                  暂时跳过，直接查看案例 →
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

interface SubmitModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: (item: UseCase) => void;
}

export function SubmitModal({ open, onClose, onSubmitted }: SubmitModalProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("software");
  const [tool, setTool] = useState("Claude Code");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [author, setAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          category,
          tool,
          url,
          prompt,
          author,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      onSubmitted(data.item);
      setTitle("");
      setSummary("");
      setUrl("");
      setPrompt("");
      setAuthor("");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-bg p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-wash hover:text-text"
        >
          <X className="size-4" />
        </button>

        <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
          投稿分享 · SUBMIT A USE CASE
        </p>
        <h3 className="mt-1.5 font-display text-xl font-bold text-text">
          提交一个 AI Agent 真实用例
        </h3>
        <p className="mt-1 text-sm text-muted">
          提交后会保存在本地目录中并立即展示在列表顶部。
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-muted">
              用例标题 *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：用 Claude Code 自动巡检 GitHub Issue 并生成修复 PR"
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted">
              一句话简介 *
            </label>
            <textarea
              required
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="简要说明做了什么以及最终效果..."
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted">
                所属分类
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                使用的 Agent
              </label>
              <select
                value={tool}
                onChange={(e) => setTool(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
              >
                {Object.keys(AGENT_PALETTE).map((ag) => (
                  <option key={ag} value={ag}>
                    {ag}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted">
              推荐提示词（可选）
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="填写可直接复制给 Agent 执行的 Prompt..."
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-text focus:border-text focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted">
                参考链接（可选）
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted">
                署名（可选）
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="你的昵称"
                className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text focus:border-text focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-text"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "提交中..." : "发布到本地目录"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AboutModalProps {
  open: boolean;
  totalCount: number;
  onClose: () => void;
}

export function AboutModal({ open, totalCount, onClose }: AboutModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl border border-line bg-bg p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-wash hover:text-text"
        >
          <X className="size-4" />
        </button>

        <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
          关于本站 · ABOUT
        </p>
        <h3 className="mt-1.5 font-display text-xl font-bold text-text">
          agentcases.ai
        </h3>

        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
          <p>
            <strong className="text-text">agentcases.ai</strong>{" "}
            是一个持续更新的中文 AI Agent 真实应用案例目录，帮助你快速发现大家正在让智能体解决哪些真实问题。
          </p>
          <p>
            当前已收录 <strong className="text-text">{totalCount}</strong>{" "}
            条真实 AI Agent 应用案例，覆盖办公运营、软件开发、理财规划、研究分析等 11 大分类，每条均附带实践过程、效果复盘与可直接复制的提示词。
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-text px-4 py-2 text-sm font-medium text-bg"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}

interface CollectionReviewModalProps {
  open: boolean;
  candidates: CandidateCollection[];
  onClose: () => void;
  onReviewed: (id: string, action: "approve" | "reject", label?: string) => Promise<void>;
}

export function CollectionReviewModal({
  open,
  candidates,
  onClose,
  onReviewed,
}: CollectionReviewModalProps) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!open) return null;

  async function handleAction(id: string, action: "approve" | "reject", defaultLabel: string) {
    setBusyId(id);
    try {
      const label = (labels[id] ?? defaultLabel).trim().slice(0, 10);
      await onReviewed(id, action, label);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-bg p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-wash hover:text-text"
        >
          <X className="size-4" />
        </button>

        <p className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
          专题发现与审核 · COLLECTIONS REVIEW
        </p>
        <h3 className="mt-1.5 font-display text-xl font-bold text-text">
          候选专题审核
        </h3>
        <p className="mt-1 text-sm text-muted">
          系统每 30 分钟自动扫描跨分类高频主题，审核通过后将立即上线至侧边栏。
        </p>

        {candidates.length === 0 ? (
          <div className="my-8 rounded-xl border border-dashed border-line bg-panel p-6 text-center text-sm text-muted">
            暂无待审核的新候选专题
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {candidates.map((c) => {
              const currentLabel = labels[c.id] ?? c.label;
              const isBusy = busyId === c.id;
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-line bg-panel/60 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      maxLength={10}
                      value={currentLabel}
                      onChange={(e) =>
                        setLabels((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      className="w-44 rounded-md border border-line bg-bg px-2.5 py-1 text-sm font-semibold text-text focus:border-text focus:outline-none"
                    />
                    <span className="font-mono text-xs text-signal">
                      匹配 {c.count} 条
                    </span>
                  </div>
                  {c.description && (
                    <p className="mt-1.5 text-xs text-muted">{c.description}</p>
                  )}
                  {c.samples?.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-dashed border-line pt-2 text-xs text-faint">
                      {c.samples.map((s, idx) => (
                        <li key={idx} className="truncate">
                          · {s}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAction(c.id, "reject", c.label)}
                      className="rounded-md border border-line bg-bg px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-50"
                    >
                      忽略
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAction(c.id, "approve", c.label)}
                      className="rounded-md bg-text px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
                    >
                      {isBusy ? "处理中..." : "审核上线"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
