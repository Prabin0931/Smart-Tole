/*
 * Project note: Admin Complaint Detail Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import ImageLightbox from "../../components/ImageLightbox";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import { getRoleLabel } from "../../data/committeeRoles";
import { addComplaintUpdate, deleteComplaint, getComplaintById } from "../../services/complaintApi";
import { getCommitteeAdmins } from "../../services/adminApi";
import { canAccessComplaintRecord, getDefaultAdminComplaintsPath, isSystemAdministrator } from "../../utils/adminAccess";
import { getAuthUser } from "../../utils/authStorage";

function AdminComplaintDetailPage() {
  const navigate = useNavigate();
  const { complaintId } = useParams();
  const authUser = getAuthUser();
  const isSystemAdmin = isSystemAdministrator(authUser);
  const [complaint, setComplaint] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    status: "Pending",
    note: "",
    priority: "Medium",
    dueDate: "",
    escalated: false,
    assignedAdminId: "",
    assignedCommittee: "General Committee"
  });
  const [committeeAdmins, setCommitteeAdmins] = useState([]);
  const [lightboxImage, setLightboxImage] = useState({ src: "", alt: "" });
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    success: ""
  });
  const { toast, showSuccess, showError, showInfo, clearToast } = useActionToast();
  const today = new Date().toISOString().slice(0, 10);
  const activeCommitteeAdmins = useMemo(
    () => committeeAdmins.filter((admin) => String(admin.accountStatus || "Active") === "Active"),
    [committeeAdmins]
  );

  useEffect(() => {
    loadComplaint();
  }, [complaintId]);

  function getAssignedCommitteeByAdminId(adminId) {
    const selectedAdmin = committeeAdmins.find((admin) => String(admin.id) === String(adminId));
    return selectedAdmin?.roleType || "General Committee";
  }

  function getAssignmentText(complaintRecord) {
    const assignedUserName = String(complaintRecord?.assigned_admin_name || "").trim();
    const assignedCommitteeLabel = getRoleLabel(complaintRecord?.assigned_committee ?? "General Committee");
    const assignmentLabel = complaintRecord?.status === "Resolved" ? "Resolved by" : "Assigned to";

    if (assignedUserName) {
      return `${assignmentLabel}: ${assignedUserName} - ${assignedCommitteeLabel}`;
    }

    if (complaintRecord?.assigned_committee) {
      return complaintRecord?.status === "Resolved"
        ? `Resolved by: ${assignedCommitteeLabel}`
        : `Assigned committee: ${assignedCommitteeLabel}`;
    }

    return complaintRecord?.status === "Resolved"
      ? "Resolved by: Unassigned"
      : "Assigned to: Pending Committee Assignment";
  }

  async function loadComplaint() {
    try {
      const [data, admins] = await Promise.all([
        getComplaintById(complaintId),
        getCommitteeAdmins()
      ]);

      if (!canAccessComplaintRecord(authUser, data)) {
        navigate(getDefaultAdminComplaintsPath(authUser), { replace: true });
        return;
      }

      setComplaint(data);
      setCommitteeAdmins(admins);
      setUpdateForm({
        status: data.status,
        note: "",
        priority: data.priority ?? "Medium",
        dueDate: data.due_date ? String(data.due_date).slice(0, 10) : "",
        escalated: Boolean(data.escalated),
        assignedAdminId: data.assigned_admin_id ? String(data.assigned_admin_id) : "",
        assignedCommittee: data.assigned_committee ?? "General Committee"
      });
      setStatus({
        loading: false,
        error: "",
        success: ""
      });
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message,
        success: ""
      });
    }
  }

  function handleFieldChange(field, value) {
    if (field === "assignedAdminId") {
      setUpdateForm((current) => ({
        ...current,
        assignedAdminId: value,
        assignedCommittee: value ? getAssignedCommitteeByAdminId(value) : "General Committee"
      }));
      return;
    }

    setUpdateForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleUpdate() {
    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));

    try {
      const response = await addComplaintUpdate(complaint.complaint_id, {
        adminId: authUser?.id,
        status: updateForm.status,
        note: updateForm.note,
        priority: updateForm.priority,
        dueDate: updateForm.dueDate || null,
        escalated: updateForm.escalated,
        assignedAdminId: updateForm.assignedAdminId ? Number(updateForm.assignedAdminId) : null,
        assignedCommittee: updateForm.assignedCommittee
      });

      showSuccess(response.message);
      setStatus((current) => ({
        ...current,
        success: response.message
      }));

      await loadComplaint();
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    }
  }

  async function handleDeleteComplaint() {
    const confirmed = window.confirm("Delete this complaint permanently?");
    if (!confirmed) {
      const cancelMessage = "Complaint deletion was canceled.";
      showInfo(cancelMessage);
      setStatus((current) => ({
        ...current,
        error: "",
        success: cancelMessage
      }));
      return;
    }

    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));

    try {
      const response = await deleteComplaint(complaintId);
      showSuccess(response.message);
      setStatus((current) => ({
        ...current,
        success: response.message
      }));
      setTimeout(() => {
        navigate("/admin/complaints", {
          state: {
            success: response.message
          }
        });
      }, 500);
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    }
  }

  return (
    <div className="stack-lg">
      <ActionToast kind={toast.kind} message={toast.message} onClose={clearToast} />
      <ImageLightbox
        isOpen={Boolean(lightboxImage.src)}
        src={lightboxImage.src}
        alt={lightboxImage.alt}
        onClose={() => setLightboxImage({ src: "", alt: "" })}
      />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Complaint Review</p>
          <h1>Complaint details</h1>
          <p className="page-description">Review and update this complaint.</p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" to="/admin/complaints">Back To Complaint Cards</Link>
        </div>
      </section>

      <SectionCard title="Complaint Review" subtitle="Details, evidence, and actions">
        {status.loading ? <p>Loading complaint details...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {status.success ? <p className="status-message status-success">{status.success}</p> : null}
        {complaint ? (
          <div className="complaint-detail-layout">
            <div className="complaint-detail-main">
              {complaint.due_date && complaint.status !== "Resolved" && String(complaint.due_date).slice(0, 10) < today ? (
                <p className="status-message status-error">Deadline overdue: due date has passed and this complaint is still unresolved.</p>
              ) : null}
              <div className="complaint-row">
                <div>
                  <strong className="item-title">{complaint.name}</strong>
                  <p className="muted-text">
                    {complaint.email} | {complaint.phone} | {complaint.category} | {complaint.priority} Priority
                    {complaint.zone ? ` | Zone ${complaint.zone}` : ""}
                  </p>
                </div>
                <span className={`pill pill-${complaint.status.toLowerCase().replace(/\s+/g, "-")}`}>
                  {complaint.status}
                </span>
              </div>
              {complaint.escalated ? (
                <p className="status-message status-error">This complaint is currently marked for urgent review.</p>
              ) : null}
              {complaint.assigned_admin_name || complaint.assigned_committee ? (
                <p className="muted-text">{getAssignmentText(complaint)}</p>
              ) : null}
              {complaint.due_date ? (
                <p className="muted-text">Due date: {new Date(complaint.due_date).toLocaleDateString()}</p>
              ) : null}
              <p>{complaint.message}</p>
              <small>Submitted: {new Date(complaint.created_at).toLocaleString()}</small>
              {complaint.photo_data ? (
                <button
                  type="button"
                  className="complaint-detail-photo complaint-detail-photo-button mt-lg"
                  onClick={() => setLightboxImage({ src: complaint.photo_data, alt: "Complaint evidence" })}
                >
                  <img src={complaint.photo_data} alt="Complaint evidence" />
                  <span className="complaint-photo-hint">Click to view full image</span>
                </button>
              ) : null}

              <div className="timeline-section mt-lg">
                <h3>Complaint Timeline</h3>
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
              </div>
            </div>

            <div className="complaint-detail-side">
              <form className="form">
                <label>
                  Status
                  <select
                    value={updateForm.status}
                    onChange={(event) => handleFieldChange("status", event.target.value)}
                  >
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Resolved</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={updateForm.priority}
                    onChange={(event) => handleFieldChange("priority", event.target.value)}
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>
                {isSystemAdmin ? (
                  <label>
                    Assigned Committee
                    <select
                      value={updateForm.assignedAdminId}
                      onChange={(event) => handleFieldChange("assignedAdminId", event.target.value)}
                    >
                      <option value="">Select assigned committee</option>
                      {activeCommitteeAdmins.map((admin) => (
                        <option key={admin.id} value={admin.id}>
                          {admin.name} - {getRoleLabel(admin.roleType)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Assigned Committee
                    <input
                      type="text"
                      value={getRoleLabel(updateForm.assignedCommittee || complaint?.assigned_committee || "General Committee")}
                      readOnly
                    />
                  </label>
                )}
                <label>
                  Due Date
                  <input
                    type="date"
                    value={updateForm.dueDate}
                    onChange={(event) => handleFieldChange("dueDate", event.target.value)}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={updateForm.escalated}
                    onChange={(event) => handleFieldChange("escalated", event.target.checked)}
                  />
                  Mark this complaint for urgent review
                </label>
                <label>
                  Committee Update
                  <textarea
                    rows="5"
                    value={updateForm.note}
                    onChange={(event) => handleFieldChange("note", event.target.value)}
                  ></textarea>
                </label>
                <button type="button" className="button" onClick={handleUpdate}>
                  Add Timeline Update
                </button>
                <button type="button" className="button button-danger" onClick={handleDeleteComplaint}>
                  Delete Complaint
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default AdminComplaintDetailPage;
