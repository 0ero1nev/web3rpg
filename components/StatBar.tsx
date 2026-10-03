export function StatBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const width = Math.max(8, Math.min(100, (value / max) * 100));
  return <div className="stat-row"><span className="stat-label">{label}</span><div className="stat-track"><span style={{ width: `${width}%` }} /></div><strong>{value}{label === "CRIT" ? "%" : ""}</strong></div>;
}
