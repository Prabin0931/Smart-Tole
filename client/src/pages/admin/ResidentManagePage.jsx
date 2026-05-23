/*
 * Project note: Resident Manage Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import { getResidentById, getResidentHistory, updateResident, deleteResidentWithMeta } from "../../services/residentApi";
import { getAuthUser } from "../../utils/authStorage";

const initialFormState = {
  id: "",
  name: "",
  email: "",
  phone: "",
  address: "",
  houseNo: ""
};

function ResidentManagePage() {
  const navigate = useNavigate();
  const { residentId } = useParams();
  const authUser = getAuthUser();
  const [formData, setFormData] = useState(initialFormState);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    saving: false,
    error: "",
    success: ""
  });
  const { toast, showSuccess, showError, showInfo, clearToast } = useActionToast();

  useEffect(() => {
    async function loadResident() {
      try {
        const [resident, residentHistory] = await Promise.all([
          getResidentById(residentId),
          getResidentHistory(residentId)
        ]);

        setFormData({
          id: resident.id,
          name: resident.name ?? "",
          email: resident.email ?? "",
          phone: resident.phone ?? "",
          address: resident.address ?? "",
          houseNo: resident.houseNo ?? ""
        });
        setHistory(residentHistory);
        setStatus({
          loading: false,
          saving: false,
          error: "",
          success: ""
        });
      } catch (error) {
        setStatus({
          loading: false,
          saving: false,
          error: error.message,
          success: ""
        });
      }
    }

    loadResident();
  }, [residentId]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus((current) => ({
      ...current,
      saving: true,
      error: "",
      success: ""
    }));

    try {
      const response = await updateResident(formData.id, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        houseNo: formData.houseNo,
        updatedByName: authUser?.name ?? authUser?.username ?? "Administrator"
      });

      showSuccess(response.message);
      setStatus((current) => ({
        ...current,
        saving: false,
        success: response.message
      }));

      const residentHistory = await getResidentHistory(residentId);
      setHistory(residentHistory);
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        saving: false,
        error: error.message
      }));
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Delete resident "${formData.name}" from the system?`);

    if (!confirmed) {
      const cancelMessage = `Deletion for resident "${formData.name}" was canceled.`;
      showInfo(cancelMessage);
      setStatus((current) => ({
        ...current,
        saving: false,
        error: "",
        success: cancelMessage
      }));
      return;
    }

    setStatus((current) => ({
      ...current,
      saving: true,
      error: "",
      success: ""
    }));

    try {
      const response = await deleteResidentWithMeta(formData.id, {
        deletedByName: authUser?.name ?? authUser?.username ?? "Administrator"
      });

      showSuccess(response.message);
      setStatus((current) => ({
        ...current,
        saving: false,
        success: response.message
      }));

      setTimeout(() => {
        navigate("/admin/residents", {
          state: {
            success: response.message
          }
        });
      }, 500);
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        saving: false,
        error: error.message
      }));
    }
  }

  return (
    <div className="stack-lg">
      <ActionToast kind={toast.kind} message={toast.message} onClose={clearToast} />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Resident Registry</p>
          <h1>Manage resident</h1>
          <p className="page-description">Update resident details.</p>
        </div>
      </section>

      <SectionCard title="Resident Editor" subtitle="Edit resident details">
        {status.loading ? <p>Loading resident...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {status.success ? <p className="status-message status-success">{status.success}</p> : null}

        {!status.loading && !status.error ? (
          <form className="form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Full Name
                <input name="name" type="text" value={formData.name} onChange={handleChange} />
              </label>
              <label>
                Email Address
                <input name="email" type="email" value={formData.email} onChange={handleChange} />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Phone Number
                <input name="phone" type="text" value={formData.phone} onChange={handleChange} />
              </label>
              <label>
                House Number
                <input name="houseNo" type="text" value={formData.houseNo} onChange={handleChange} />
              </label>
            </div>
            <label>
              Address
              <input name="address" type="text" value={formData.address} onChange={handleChange} />
            </label>
            <div className="button-row">
              <button type="submit" className="button" disabled={status.saving}>
                {status.saving ? "Saving..." : "Save Resident"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => navigate("/admin/residents")}
                disabled={status.saving}
              >
                Back To Directory
              </button>
              <button type="button" className="button button-danger" onClick={handleDelete} disabled={status.saving}>
                Delete Resident
              </button>
            </div>
          </form>
        ) : null}
      </SectionCard>

      <SectionCard title="Update History" subtitle="Change history">
        {status.loading ? <p>Loading history...</p> : null}
        {!status.loading ? (
          <div className="stack-sm">
            {history.map((item) => (
              <article key={item.history_id} className="list-item">
                <strong>{item.action_type}</strong>
                <p>{item.details}</p>
                <small>{item.admin_name} - {new Date(item.created_at).toLocaleString()}</small>
              </article>
            ))}
            {history.length === 0 ? <p className="muted-text">No history yet.</p> : null}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default ResidentManagePage;
