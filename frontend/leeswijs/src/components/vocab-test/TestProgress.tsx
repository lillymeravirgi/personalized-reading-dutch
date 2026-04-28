type Props = {
  current: number;
  total: number;
};

export default function TestProgress({ current, total }: Props) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide">
          Progress
        </span>
        <span className="text-xs font-body text-text/50">
          {current} / {total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
