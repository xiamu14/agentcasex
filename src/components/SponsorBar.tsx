import { useState } from "react";
import { X } from "lucide-react";
import { DEFAULT_SPONSORS } from "../constants";
import type { SponsorItem } from "../types";

interface SponsorBarProps {
  sponsors: SponsorItem[];
}

export function SponsorBar({ sponsors }: SponsorBarProps) {
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem("auc-sponsor-hidden") === "1";
    } catch {
      return false;
    }
  });

  if (hidden) return null;

  const list = sponsors.length > 0 ? sponsors : DEFAULT_SPONSORS;

  function handleHide() {
    setHidden(true);
    try {
      localStorage.setItem("auc-sponsor-hidden", "1");
      document.documentElement.setAttribute("data-sponsor-hidden", "");
    } catch {}
  }

  const renderSet = (keyPrefix: string) => (
    <div className="sponsor-set gap-8 pr-8">
      {list.map((sp, idx) => (
        <a
          key={`${keyPrefix}-${idx}`}
          href={sp.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] transition-opacity hover:opacity-80"
        >
          {sp.isCta ? (
            <span className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-faint font-mono text-[11px] text-faint">
              +
            </span>
          ) : (
            <span className="inline-flex size-5 items-center justify-center rounded border border-line bg-bg font-mono text-[10px] font-bold text-text">
              {sp.mark}
            </span>
          )}
          <span className={sp.isCta ? "text-faint" : "font-semibold text-text"}>
            {sp.isCta ? sp.tagline : sp.name}
          </span>
          {!sp.isCta && (
            <span className="text-muted">
              <span className="mr-1">:</span>
              {sp.tagline}
            </span>
          )}
        </a>
      ))}
    </div>
  );

  return (
    <div
      data-sponsor-bar=""
      aria-label="赞助商"
      className="fixed inset-x-0 bottom-0 z-40 flex h-11 items-center border-t border-line bg-panel sm:h-[52px]"
    >
      <div className="flex h-full shrink-0 items-center border-r border-line px-3 font-mono text-[10px] tracking-[0.14em] text-faint uppercase sm:px-4">
        赞助商
      </div>

      <div className="sponsor-marquee h-full flex-1">
        <div className="sponsor-track">
          {renderSet("a")}
          {renderSet("b")}
          {renderSet("c")}
          {renderSet("d")}
        </div>
      </div>

      <button
        type="button"
        onClick={handleHide}
        aria-label="隐藏赞助商栏"
        className="flex h-full shrink-0 items-center justify-center border-l border-line px-3 text-faint transition-colors hover:text-text"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
