export function Logo({ className = "size-[41px] lg:size-[48px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 25 25" className={className} aria-hidden="true">
      <defs>
        <clipPath id="auc-hex-clip">
          <polygon points="12.5,0.3 23.8,6.4 23.8,18.6 12.5,24.7 1.2,18.6 1.2,6.4" />
        </clipPath>
      </defs>
      <g clipPath="url(#auc-hex-clip)">
        <rect x="0.75" y="0.75" width="3.5" height="3.5" rx="0.6" fill="#7dd3fc" />
        <rect x="5.75" y="0.75" width="3.5" height="3.5" rx="0.6" fill="#5aabff" />
        <rect x="10.75" y="0.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="15.75" y="0.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="20.75" y="0.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />

        <rect x="0.75" y="5.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="5.75" y="5.75" width="3.5" height="3.5" rx="0.6" fill="#818cf8" />
        <rect x="10.75" y="5.75" width="3.5" height="3.5" rx="0.6" fill="#a78bfa" />
        <rect x="15.75" y="5.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="20.75" y="5.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />

        <rect x="0.75" y="10.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="5.75" y="10.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="10.75" y="10.75" width="3.5" height="3.5" rx="0.6" fill="#c084fc" />
        <rect x="15.75" y="10.75" width="3.5" height="3.5" rx="0.6" fill="#e879f9" />
        <rect x="20.75" y="10.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />

        <rect x="0.75" y="15.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="5.75" y="15.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="10.75" y="15.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="15.75" y="15.75" width="3.5" height="3.5" rx="0.6" fill="#f472b6" />
        <rect x="20.75" y="15.75" width="3.5" height="3.5" rx="0.6" fill="#fb7185" />

        <rect x="0.75" y="20.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="5.75" y="20.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="10.75" y="20.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="15.75" y="20.75" width="3.5" height="3.5" rx="0.6" fill="var(--line)" />
        <rect x="20.75" y="20.75" width="3.5" height="3.5" rx="0.6" fill="#fda4af" />
      </g>
    </svg>
  );
}
