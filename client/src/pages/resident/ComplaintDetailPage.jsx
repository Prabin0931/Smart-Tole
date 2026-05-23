/*
 * Project note: Complaint Detail Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ImageLightbox from "../../components/ImageLightbox";
import SectionCard from "../../components/SectionCard";
import { getRoleLabel } from "../../data/committeeRoles";
import { getResidentComplaintById } from "../../services/complaintApi";
import { getAuthUser } from "../../utils/authStorage";

function ComplaintDetailPage() {
  const { complaintId } = useParams();
  const authUser = getAuthUser();
  const [complaint, setComplaint] = useState(null);
  const [lightboxImage, setLightboxImage] = useState({ src: "", alt: "" });
  const [status, setStatus] = useState({
    loading: true,
    error: ""
  });

  useEffect(() => {
    async function loadComplaint() {
      try {
        const data = await getResidentComplaintById(authUser?.id, complaintId);
        setComplaint(data);
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

    loadComplaint();
  }, [authUser?.id, complaintId]);

  const dueDate = complaint?.due_date ? new Date(complaint.due_date).toISOString().slice(0, 10) : "";
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = Boolean(dueDate && complaint?.status !== "Resolved" && dueDate < today);

  return (
    <div className="stack-lg">
      <ImageLightbox
        isOpen={Boolean(lightboxImage.src)}
        src={lightboxImage.src}
        alt={lightboxImage.alt}
        onClose={() => setLightboxImage({ src: "", alt: "" })}
      />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Issue Tracking</p>
          <h1>Complaint details</h1>
          <p className="page-description">View this complaint and updates.</p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" to="/resident/complaints">Back To Complaint Cards</Link>
          {complaint ? (
            <Link className="button" to={`/resident/complaints/${complaint.complaint_id}/edit`}>
              Edit Complaint
            </Link>
          ) : null}
        </div>
      </section>

      <SectionCard title="Complaint Details" subtitle="Details and status">
        {status.loading ? <p>Loading complaint details...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {complaint ? (
          <div className="complaint-detail-layout">
            <div className="complaint-detail-main">
              {isOverdue ? (
                <p className="status-message status-error">Deadline overdue: this complaint passed its due date and is still unresolved.</p>
              ) : null}
              <div className="complaint-row">
                <div>
                  <strong className="item-title">{complaint.category}</strong>
                  <p className="muted-text">
                    Submitted {new Date(complaint.created_at).toLocaleString()} - {complaint.priority} Priority
                    {complaint.assigned_committee ? ` - ${getRoleLabel(complaint.assigned_committee)}` : ""}
                  </p>
                </div>
                <span className={`pill pill-${complaint.status.toLowerCase().replace(/\s+/g, "-")}`}>
                  {complaint.status}
                </span>
              </div>
              {complaint.escalated ? (
                <p className="status-message status-error">This complaint has been marked for urgent review for faster committee attention.</p>
              ) : null}
              {complaint.due_date ? (
                <p className="muted-text">Due date: {new Date(complaint.due_date).toLocaleDateString()}</p>
              ) : null}
              <p>{complaint.message}</p>
              {complaint.photo_data ? (
                <button
                  type="button"
                  className="complaint-detail-photo complaint-detail-photo-button"
                  onClick={() => setLightboxImage({ src: complaint.photo_data, alt: "Complaint evidence" })}
                >
                  <img src={complaint.photo_data} alt="Complaint evidence" />
                  <span className="complaint-photo-hint">Click to view full image</span>
                </button>
              ) : null}
            </div>

            <div className="complaint-detail-side">
              <h3>Committee Timeline</h3>
              <div className="timeline-list">
                <article className="timeline-item">
                  <span className="timeline-dot"></span>
                  <div className="timeline-content">
                    <strong>Complaint Submitted</strong>
                    <p>{complaint.message}</p>
                    <small>{new Date(complaint.created_at).toLocaleString()}</small>
                  </div>
                </article>
                {complaint.updates?.map((update) => (
                  <article key={update.update_id} className="timeline-item">
                    <span className="timeline-dot timeline-dot-brand"></span>
                    <div className="timeline-content">
                      <strong>{update.admin_name} marked it {update.status}</strong>
                      <p>{update.note}</p>
                      <small>{new Date(update.created_at).toLocaleString()}</small>
                    </div>
                  </article>
                ))}
              </div>
              {!complaint.updates?.length ? (
                <p className="muted-text">No updates yet.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default ComplaintDetailPage;
