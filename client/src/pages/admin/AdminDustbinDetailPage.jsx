/*
 * Project note: Admin Dustbin Detail Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import SectionCard from "../../components/SectionCard";
import { rememberSectionReturn } from "../../hooks/useSectionReturn";
import { getGarbageBins } from "../../services/garbageApi";
import { getAuthUser } from "../../utils/authStorage";
import { canUpdateGarbageBins } from "../../utils/adminAccess";
import { formatNepalDateTime } from "../../utils/dateTime";
import { getGarbageDisplayState } from "../../utils/garbageStatus";

function AdminDustbinDetailPage() {
  const authUser = getAuthUser();
  const navigate = useNavigate();
  const { binId } = useParams();
  const decodedBinId = decodeURIComponent(String(binId || "").trim());
  const canUpdateDustbins = canUpdateGarbageBins(authUser);
  const [dustbins, setDustbins] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    success: ""
  });
  const [toast, setToast] = useState({
    kind: "success",
    message: ""
  });

  const selectedBin = useMemo(
    () => dustbins.find((bin) => String(bin.binId) === decodedBinId) ?? null,
    [dustbins, decodedBinId]
  );

  useEffect(() => {
    loadDustbin();
  }, [decodedBinId]);

  useEffect(() => {
    if (!toast.message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast({
        kind: "success",
        message: ""
      });
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  async function loadDustbin() {
    try {
      const binData = await getGarbageBins();
      setDustbins(binData);
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

  function handleEditDustbin() {
    rememberSectionReturn("admin-garbage-monitoring", "form");
    navigate(`/admin/garbage-monitoring?bin=${encodeURIComponent(decodedBinId)}&edit=${encodeURIComponent(decodedBinId)}`);
  }

  return (
    <div className="stack-lg">
      <ActionToast
        kind={toast.kind}
        message={toast.message}
        onClose={() =>
          setToast({
            kind: "success",
            message: ""
          })
        }
      />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Dustbin Detail</p>
          <h1>Dustbin {decodedBinId}</h1>
          <p className="page-description">View this dustbin record.</p>
        </div>
        <div className="button-row">
          <Link
            className="button button-secondary"
            to={`/admin/garbage-monitoring?bin=${encodeURIComponent(decodedBinId)}`}
            onClick={() => rememberSectionReturn("admin-garbage-monitoring", "management")}
          >
            Back To Garbage Monitoring
          </Link>
        </div>
      </section>

      <SectionCard title="Dustbin Record" subtitle="Linked device and resident details">
        {status.loading ? <p>Loading dustbin details...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {status.success ? <p className="status-message status-success">{status.success}</p> : null}
        {!status.loading && !status.error && !selectedBin ? (
          <p className="muted-text">No record found for {decodedBinId}.</p>
        ) : null}
        {selectedBin ? (
          <div className="stack-sm">
            <div className="iot-device-table-wrap">
              <table className="dustbin-details-table">
                <thead>
                  <tr>
                    <th>Dustbin ID</th>
                    <th>Fill Level</th>
                    <th>Status</th>
                    <th>Zone</th>
                    <th>Location</th>
                    <th>Device Status</th>
                    <th>IoT Device ID</th>
                    <th>Assigned Resident</th>
                    <th>House No</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{selectedBin.binId}</td>
                    <td>{selectedBin.fillPercentage}%</td>
                    <td>{getGarbageDisplayState(selectedBin, selectedBin.status).statusLabel}</td>
                    <td>{selectedBin.zone ?? "-"}</td>
                    <td>{selectedBin.locationLabel ?? "-"}</td>
                    <td>{selectedBin.deviceStatus ?? "-"}</td>
                    <td>{selectedBin.deviceId || "-"}</td>
                    <td>{selectedBin.assignedUserName ?? "-"}</td>
                    <td>{selectedBin.assignedHouseNo ?? "-"}</td>
                    <td>{selectedBin.assignedAddress ?? "-"}</td>
                    <td>{selectedBin.assignedPhone ?? "-"}</td>
                    <td>{selectedBin.assignedEmail ?? "-"}</td>
                    <td>{formatNepalDateTime(selectedBin.timestamp)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {canUpdateDustbins ? (
              <div className="button-row">
                <button type="button" className="button button-secondary" onClick={handleEditDustbin}>
                  Edit Dustbin
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default AdminDustbinDetailPage;
