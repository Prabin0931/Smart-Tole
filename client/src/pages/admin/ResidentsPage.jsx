/*
 * Project note: Residents Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import { getResidents } from "../../services/residentApi";
import { getAuthUser } from "../../utils/authStorage";
import { canEditResidents } from "../../utils/adminAccess";

function ResidentsPage() {
  const authUser = getAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [residents, setResidents] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    saving: false,
    error: "",
    success: ""
  });
  const { toast, showSuccess, clearToast } = useActionToast();
  const canManageResidentRecords = canEditResidents(authUser);

  useEffect(() => {
    loadResidents();
  }, []);

  useEffect(() => {
    const successMessage = location.state?.success;
    if (!successMessage) {
      return;
    }

    showSuccess(successMessage);
    setStatus((current) => ({
      ...current,
      error: "",
      success: successMessage
    }));
    navigate(location.pathname, {
      replace: true,
      state: {}
    });
  }, [location.pathname, location.state, navigate]);

  async function loadResidents() {
    try {
      const residentData = await getResidents();
      setResidents(residentData);
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

  return (
    <div className="stack-lg">
      <ActionToast kind={toast.kind} message={toast.message} onClose={clearToast} />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Resident Registry</p>
          <h1>Registered residents</h1>
          <p className="page-description">Manage resident records.</p>
        </div>
      </section>

      <SectionCard title="Resident Directory" subtitle="Current residents">
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {status.success ? <p className="status-message status-success">{status.success}</p> : null}
        {status.loading ? <p>Loading residents...</p> : null}
        {!status.loading ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>SN</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Zone</th>
                  <th>Address</th>
                  <th>House No</th>
                  <th>Phone</th>
                  {canManageResidentRecords ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {residents.map((resident, index) => (
                  <tr key={resident.id}>
                    <td>{index + 1}</td>
                    <td>{resident.name}</td>
                    <td>{resident.email}</td>
                    <td>{resident.accountStatus ?? "Active"}</td>
                    <td>{resident.zone}</td>
                    <td>{resident.address}</td>
                    <td>{resident.houseNo}</td>
                    <td>{resident.phone}</td>
                    {canManageResidentRecords ? (
                      <td>
                        <div className="table-action-row">
                          <button
                            type="button"
                            className="button button-secondary table-action-button"
                            onClick={() => navigate(`/admin/residents/${resident.id}/edit`)}
                            disabled={status.saving}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default ResidentsPage;
