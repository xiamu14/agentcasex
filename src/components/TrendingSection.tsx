import { useEffect } from "react";
import type { TrendingItem, UseCase } from "../types";
import { UseCaseRow } from "./UseCaseRow";

interface TrendingSectionProps {
  items: TrendingItem[];
  refDate: Date;
  getVotes: (id: string) => number;
  votedIds: Set<string>;
  savedIds: Set<string>;
  tr: (text?: string | null) => string;
  queueTranslate: (texts: (string | null | undefined)[]) => void;
  onSelect: (item: UseCase) => void;
  onVote: (id: string) => void;
  onSave: (id: string) => void;
  onSelectAgent: (agent: string) => void;
}

export function TrendingSection({
  items,
  refDate,
  getVotes,
  votedIds,
  savedIds,
  tr,
  queueTranslate,
  onSelect,
  onVote,
  onSave,
  onSelectAgent,
}: TrendingSectionProps) {
  useEffect(() => {
    if (items.length > 0) {
      const texts: string[] = [];
      for (const it of items) {
        if (it.usecase.title) texts.push(it.usecase.title);
        if (it.usecase.summary) texts.push(it.usecase.summary);
      }
      queueTranslate(texts);
    }
  }, [items, queueTranslate]);

  if (items.length === 0) return null;

  return (
    <section
      aria-label="今日热门"
      className="border-b border-dashed border-line"
    >
      <div className="sticky top-[var(--toolbar-h,111px)] z-20 flex items-center justify-between border-b border-dashed border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-6">
        <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-faint uppercase">
          今日热门 · TRENDING TODAY
        </h2>
        <span className="font-mono text-[11px] text-faint">
          {items.length}
        </span>
      </div>

      <ul>
        {items.map((item) => (
          <UseCaseRow
            key={`trending-${item.usecase.id}`}
            item={item.usecase}
            votes={getVotes(item.usecase.id)}
            voted={votedIds.has(item.usecase.id)}
            saved={savedIds.has(item.usecase.id)}
            refDate={refDate}
            tr={tr}
            onSelect={onSelect}
            onVote={onVote}
            onSave={onSave}
            onSelectAgent={onSelectAgent}
          />
        ))}
      </ul>
    </section>
  );
}
