/*
 * Project note: Complaint History Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import { SERVICE_MODULES, getServiceModuleByCategory } from "../../data/serviceModules";
import { getResidentComplaints } from "../../services/complaintApi";
import { getAuthUser } from "../../utils/authStorage";

function ComplaintHistoryPage() {
  const authUser = getAuthUser();
  const location = useLocation();
  const [complaints, setComplaints] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    error: ""
  });

  useEffect(() => {
    async function loadComplaints() {
      try {
        const data = await getResidentComplaints(authUser?.id);
        setComplaints(data);
        setStatus({
          loading: false,
          error: ""
        });
      } catch (error) {
        setStatus({
          loading: false,
          error: error.message
        });
      }
    }

    loadComplaints();
  }, [authUser?.id]);

  const moduleQuery = new URLSearchParams(location.search).get("module");
  const filteredComplaints = moduleQuery
    ? complaints.filter((complaint) => getServiceModuleByCategory(complaint.category).id === moduleQuery)
    : complaints;

  const moduleCounts = SERVICE_MODULES.map((module) => ({
    ...module,
    total: complaints.filter((complaint) => getServiceModuleByCategory(complaint.category).id === module.id).length
  }));

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Issue Tracking</p>
          <h1>My recent complaints</h1>
          <p className="page-description">Track your complaints.</p>
        </div>
        <div className="button-row">
          <Link className="button" to="/resident/complaints/new">Submit New Complaint</Link>
        </div>
      </section>

      <SectionCard title="Complaint Cards" subtitle="Open a complaint to view details">
        <div className="service-filter-row">
          <Link className={`service-filter-chip ${!moduleQuery ? "service-filter-chip-active" : ""}`} to="/resident/complaints">
            All Services ({complaints.length})
          </Link>
          {moduleCounts.map((module) => (
            <Link
              key={module.id}
              className={`service-filter-chip ${moduleQuery === module.id ? "service-filter-chip-active" : ""}`}
              to={`/resident/complaints?module=${module.id}`}
            >
              {module.shortLabel} ({module.total})
            </Link>
          ))}
        </div>
        {status.loading ? <p>Loading complaints...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {!status.loading && !status.error ? (
          <div className="complaint-grid">
            {filteredComplaints.length === 0 ? <p>No complaints found.</p> : null}
            {filteredComplaints.map((complaint) => {
              const serviceModule = getServiceModuleByCategory(complaint.category);

              return (
                <Link
                  key={complaint.complaint_id}
                  className="complaint-tile"
                  to={`/resident/complaints/${complaint.complaint_id}`}
                >
                  <span className="complaint-tile-kicker">{serviceModule.shortLabel}</span>
                  <strong>{complaint.message.split(":")[0] || complaint.category}</strong>
                  <p>
                    {complaint.category} - {complaint.priority} Priority
                    {complaint.escalated ? " - Urgent Review" : ""}
                  </p>
                  <small>{new Date(complaint.created_at).toLocaleString()}</small>
                  <span className={`pill pill-${complaint.status.toLowerCase().replace(/\s+/g, "-")}`}>
                    {complaint.status}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default ComplaintHistoryPage;
