/*
 * Project note: Section Card is a reusable interface component used across Smart Tole.
 * Keep this component focused on display behavior so page-specific business rules stay in the page or service layer.
 */
function SectionCard({ title, subtitle, children, actions = null, tone = "default" }) {
  return (
    <section className={`card card-${tone}`}>
      <div className="card-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

export default SectionCard;
