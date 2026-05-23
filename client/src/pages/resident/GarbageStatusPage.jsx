/*
 * Project note: Garbage Status Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import { getGarbageBins } from "../../services/garbageApi";
import { getAuthUser } from "../../utils/authStorage";
import { getGarbageDisplayState } from "../../utils/garbageStatus";

function GarbageStatusPage() {
  const [searchParams] = useSearchParams();
  const authUser = getAuthUser();
  const [dustbins, setDustbins] = useState([]);
  const [selectedBinId, setSelectedBinId] = useState("");
  const [status, setStatus] = useState({
    loading: true,
    error: ""
  });

  const selectedBin = useMemo(
    () => dustbins.find((bin) => bin.binId === selectedBinId) ?? dustbins[0] ?? null,
    [dustbins, selectedBinId]
  );
  const requestedBinId = String(searchParams.get("bin") || "").trim();
  const selectedBinDisplay = getGarbageDisplayState(selectedBin, selectedBin?.status ?? "Unknown");

  useEffect(() => {
    async function loadGarbageData() {
      try {
        const historyData = await getGarbageBins(authUser?.id);
        setDustbins(historyData);
        setSelectedBinId(() => {
          if (requestedBinId && historyData.some((bin) => String(bin.binId) === requestedBinId)) {
            return requestedBinId;
          }
          return historyData[0]?.binId ?? "";
        });
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

    loadGarbageData();
  }, [authUser?.id, requestedBinId]);

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Smart Monitoring</p>
          <h1>Garbage collection status</h1>
          <p className="page-description">View your assigned dustbins.</p>
        </div>
      </section>

      <SectionCard title="Current Status" subtitle="Choose a dustbin">
        {status.loading ? <p>Loading garbage status...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {!status.loading && !status.error && dustbins.length > 0 ? (
          <div className="dustbin-picker mb-md">
            <div className="dustbin-picker-icon">
              <span className="material-symbols-outlined">delete</span>
            </div>
            <label className="dustbin-picker-field">
              <span className="dustbin-picker-label">Choose dustbin</span>
              <select value={selectedBin?.binId ?? ""} onChange={(event) => setSelectedBinId(event.target.value)}>
                {dustbins.map((bin) => (
                  <option key={bin.binId} value={bin.binId}>
                    Dustbin {bin.binId} - {bin.locationLabel ?? bin.assignedHouseNo ?? authUser?.houseNo ?? "Assigned Household"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {selectedBin ? (
          <div className="info-grid mb-md">
            <div className="info-box">
              <span>Dustbin ID</span>
              <strong>{selectedBin.binId}</strong>
            </div>
            <div className="info-box">
              <span>Current Fill</span>
              <strong>{selectedBinDisplay.fillLabel}</strong>
            </div>
            <div className="info-box">
              <span>Status</span>
              <strong>{selectedBinDisplay.statusLabel}</strong>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="My Assigned Dustbins" subtitle="Assigned dustbins">
        {status.loading ? <p>Loading your assigned dustbins...</p> : null}
        {!status.loading && !status.error && dustbins.length === 0 ? (
          <p className="muted-text">No dustbin assigned yet.</p>
        ) : null}
        <div className="dustbin-grid">
          {dustbins.map((bin) => {
            const binDisplay = getGarbageDisplayState(bin, bin.status);

            return (
              <button
                key={bin.binId}
                type="button"
                className={`dustbin-tile ${selectedBin?.binId === bin.binId ? "dustbin-tile-active" : ""}`}
                onClick={() => setSelectedBinId(bin.binId)}
              >
                <span className="dustbin-tile-kicker">Dustbin {bin.binId}</span>
                <strong>{binDisplay.statusLabel}</strong>
                <p>{bin.locationLabel ?? bin.assignedHouseNo ?? authUser?.houseNo ?? "Assigned Household"}</p>
                <small>{binDisplay.fillLabel} - Zone {bin.zone ?? "General"}</small>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {selectedBin ? (
        <SectionCard title={`Dustbin ${selectedBin.binId} Details`} subtitle="Assignment and status">
          <div className="dustbin-detail-layout">
            <div className="dustbin-detail-panel">
              <div className="info-grid">
                <div className="info-box">
                  <span>Dustbin ID</span>
                  <strong>{selectedBin.binId}</strong>
                </div>
                <div className="info-box">
                  <span>Fill Level</span>
                  <strong>{selectedBinDisplay.fillLabel}</strong>
                </div>
                <div className="info-box">
                  <span>Status</span>
                  <strong>{selectedBinDisplay.statusLabel}</strong>
                </div>
              </div>
              <div className="info-grid mt-lg">
                <div className="info-box">
                  <span>Zone</span>
                  <strong>{selectedBin.zone ?? "-"}</strong>
                </div>
                <div className="info-box">
                  <span>Location</span>
                  <strong>{selectedBin.locationLabel ?? "-"}</strong>
                </div>
                <div className="info-box">
                  <span>Device Status</span>
                  <strong>{selectedBin.deviceStatus ?? "-"}</strong>
                </div>
              </div>
              <div className="info-grid mt-lg">
                <div className="info-box">
                  <span>House No</span>
                  <strong>{selectedBin.assignedHouseNo ?? authUser?.houseNo ?? "-"}</strong>
                </div>
                <div className="info-box">
                  <span>Last Updated</span>
                  <strong>{selectedBin.timestamp}</strong>
                </div>
              </div>
            </div>

            <div className="dustbin-resident-panel">
              <h3>Assignment Details</h3>
              <p><strong>Name:</strong> {selectedBin.assignedUserName ?? authUser?.fullName ?? "-"}</p>
              <p><strong>Address:</strong> {selectedBin.assignedAddress ?? authUser?.address ?? "-"}</p>
              <p><strong>Phone:</strong> {selectedBin.assignedPhone ?? authUser?.phone ?? "-"}</p>
              <p><strong>Email:</strong> {selectedBin.assignedEmail ?? authUser?.email ?? "-"}</p>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

export default GarbageStatusPage;
