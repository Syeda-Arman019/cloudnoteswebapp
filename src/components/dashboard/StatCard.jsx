/**
 * StatCard — dashboard statistic tile.
 */

export default function StatCard({ icon: Icon, value, label, tone = '' }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`.trim()} aria-hidden="true">
        <Icon size={21} />
      </span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
