interface TriTile {
  points: string;
  fill: string;
}

const TILES: TriTile[] = [
  { points: "12.94,11.74 12.94,7.36 16.73,9.55", fill: "var(--line)" },
  { points: "13.38,6.60 17.17,4.41 17.17,8.79", fill: "var(--line)" },
  { points: "18.05,8.79 18.05,4.41 21.84,6.60", fill: "var(--line)" },
  { points: "12.94,5.84 12.94,1.46 16.73,3.65", fill: "var(--line)" },
  { points: "13.38,12.50 17.17,10.31 17.17,14.69", fill: "#e879f9" },
  { points: "18.05,10.31 21.84,12.50 18.05,14.69", fill: "var(--line)" },
  { points: "18.49,15.45 22.28,13.26 22.28,17.64", fill: "var(--line)" },
  { points: "18.49,9.55 22.28,7.36 22.28,11.74", fill: "var(--line)" },
  { points: "12.94,13.26 16.73,15.45 12.94,17.64", fill: "#f472b6" },
  { points: "17.17,16.21 17.17,20.59 13.38,18.40", fill: "#fb7185" },
  { points: "12.94,19.16 16.73,21.35 12.94,23.54", fill: "var(--line)" },
  { points: "18.05,16.21 21.84,18.40 18.05,20.59", fill: "#fda4af" },
  { points: "12.06,13.26 12.06,17.64 8.27,15.45", fill: "var(--line)" },
  { points: "11.62,18.40 7.83,20.59 7.83,16.21", fill: "var(--line)" },
  { points: "6.95,16.21 6.95,20.59 3.16,18.40", fill: "var(--line)" },
  { points: "12.06,19.16 12.06,23.54 8.27,21.35", fill: "var(--line)" },
  { points: "11.62,12.50 7.83,14.69 7.83,10.31", fill: "#a78bfa" },
  { points: "6.95,14.69 3.16,12.50 6.95,10.31", fill: "var(--line)" },
  { points: "6.51,9.55 2.72,11.74 2.72,7.36", fill: "var(--line)" },
  { points: "6.51,15.45 2.72,17.64 2.72,13.26", fill: "var(--line)" },
  { points: "12.06,11.74 8.27,9.55 12.06,7.36", fill: "#818cf8" },
  { points: "7.83,8.79 7.83,4.41 11.62,6.60", fill: "#5aabff" },
  { points: "12.06,5.84 8.27,3.65 12.06,1.46", fill: "var(--line)" },
  { points: "6.95,8.79 3.16,6.60 6.95,4.41", fill: "#7dd3fc" },
];

export function Logo({
  className = "size-[41px] lg:size-[48px]",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 25 25" className={className} aria-hidden="true">
      {TILES.map((tile, idx) => (
        <polygon
          key={idx}
          points={tile.points}
          fill={tile.fill}
          stroke={tile.fill}
          strokeWidth="0.35"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
