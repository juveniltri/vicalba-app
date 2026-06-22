function computeHeights(
  seed: number,
  base: number,
  amp: number,
  bars: number,
): number[] {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const next = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

  const heights: number[] = [];
  let v = base;
  for (let i = 0; i < bars; i++) {
    v += (next() - 0.5) * amp;
    if (v < 8) v = 8 + next() * 6;
    if (v > 100) v = 100 - next() * 6;
    heights.push(Math.round(v));
  }
  return heights;
}

export function Sparkline({
  seed,
  base,
  amp,
  bars = 26,
  className = "",
}: {
  seed: number;
  base: number;
  amp: number;
  bars?: number;
  className?: string;
}) {
  const heights = computeHeights(seed, base, amp, bars);

  return (
    <div className={`flex items-end gap-[2px] h-[30px] mt-3 ${className}`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1px] min-h-[2px]"
          style={{
            height: `${h}%`,
            opacity: i === heights.length - 1 ? 1 : 0.55,
            background: "currentColor",
          }}
        />
      ))}
    </div>
  );
}
