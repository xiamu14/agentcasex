import { useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

interface ShareMenuProps {
  id: string;
  title: string;
  compact?: boolean;
}

export function ShareMenu({ id, title, compact = false }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const localUrl = `${window.location.origin}/use-case/${id}`;
  const upstreamUrl = `https://agentusecases.ai/use-case/${id}`;

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 900);
    } catch {
      setOpen(false);
    }
  }

  function handleShareX() {
    const xUrl = new URL("https://x.com/intent/post");
    xUrl.searchParams.set("text", title);
    xUrl.searchParams.set("url", upstreamUrl);
    window.open(xUrl.toString(), "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-label={`分享：${title}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center justify-center gap-1 rounded-md border border-line bg-bg font-medium text-text transition-colors hover:border-faint ${
          compact ? "h-8 px-2.5 text-[12px]" : "min-h-8 px-2.5 text-[12px]"
        }`}
      >
        {copied ? "已复制" : "分享"}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 bottom-full z-40 mb-1.5 w-44 rounded-lg border border-line bg-bg p-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => handleCopy(localUrl)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text hover:bg-wash"
          >
            {copied ? <Check className="size-3.5 text-signal" /> : <Link2 className="size-3.5 text-muted" />}
            <span>复制本地链接</span>
          </button>
          <button
            type="button"
            onClick={() => handleCopy(upstreamUrl)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text hover:bg-wash"
          >
            <Link2 className="size-3.5 text-muted" />
            <span>复制原站链接</span>
          </button>
          <button
            type="button"
            onClick={handleShareX}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text hover:bg-wash"
          >
            <Share2 className="size-3.5 text-muted" />
            <span>分享到 X</span>
          </button>
        </div>
      )}
    </div>
  );
}
