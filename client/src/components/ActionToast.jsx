/*
 * Project note: Action Toast is a reusable interface component used across Smart Tole.
 * Keep this component focused on display behavior so page-specific business rules stay in the page or service layer.
 */
function ActionToast({ kind = "success", message, onClose }) {
  if (!message) {
    return null;
  }

  const title =
    kind === "error"
      ? "Action failed"
      : kind === "info"
        ? "Action canceled"
        : "Action completed";

  return (
    <div className={`action-toast action-toast-${kind}`} role="status" aria-live="polite">
      <div className="action-toast-copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <button type="button" className="action-toast-close" onClick={onClose} aria-label="Close message">
        x
      </button>
    </div>
  );
}

export default ActionToast;
