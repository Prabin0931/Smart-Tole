/*
 * Project note: Stat Card is a reusable interface component used across Smart Tole.
 * Keep this component focused on display behavior so page-specific business rules stay in the page or service layer.
 */
import { Link } from "react-router-dom";

function StatCard({ label, value, tone = "default", to, onClick }) {
  const className = `stat-card stat-card-${tone}${to ? " stat-card-link" : ""}`;

  if (to) {
    return (
      <Link className={className} to={to} onClick={onClick}>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={`${className} stat-card-link stat-card-button`} onClick={onClick}>
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
      </button>
    );
  }

  return (
    <div className={className}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}

export default StatCard;
