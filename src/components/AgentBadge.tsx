import { getAgentStyle } from "../constants";

interface AgentBadgeProps {
  name?: string | null;
  size?: "xs" | "sm" | "md";
  isCustom?: boolean;
}

export function AgentBadge({ name, size = "md", isCustom = false }: AgentBadgeProps) {
  const sizeClass =
    size === "xs"
      ? "size-4 text-[8px] rounded-[4px]"
      : size === "sm"
      ? "size-5 text-[9px] rounded-[5px]"
      : "size-6 text-[10px] rounded-md";

  if (isCustom || !name) {
    return (
      <span
        aria-hidden="true"
        className={`tile-placeholder inline-flex shrink-0 items-center justify-center border border-dashed font-mono text-faint ${sizeClass}`}
      >
        ··
      </span>
    );
  }

  const { mark, color } = getAgentStyle(name);
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={`mark-edge inline-flex shrink-0 items-center justify-center font-mono font-semibold tracking-tight text-black ${sizeClass}`}
    >
      {mark}
    </span>
  );
}
