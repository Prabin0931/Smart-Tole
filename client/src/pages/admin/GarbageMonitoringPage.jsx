/*
 * Project note: Garbage Monitoring Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import SectionCard from "../../components/SectionCard";
import useSectionReturn from "../../hooks/useSectionReturn";
import {
  createGarbageReading,
  deleteGarbageBin,
  getGarbageBins,
  getIotDevices,
  getLatestGarbageStatus,
  updateGarbageBin
} from "../../services/garbageApi";
import { getActiveResidents } from "../../services/residentApi";
import { getAuthUser } from "../../utils/authStorage";
import { canDeleteGarbageBins, canManageGarbageBins, canUpdateGarbageBins } from "../../utils/adminAccess";
import { formatNepalDateTime } from "../../utils/dateTime";
import { getGarbageDisplayState } from "../../utils/garbageStatus";

const GARBAGE_MONITORING_SECTION_KEYS = {
  form: "form",
  management: "management"
};

function GarbageMonitoringPage() {
  const authUser = getAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const formSectionRef = useRef(null);
  const managementSectionRef = useRef(null);
  const canManageDustbins = canManageGarbageBins(authUser);
  const canUpdateDustbins = canUpdateGarbageBins(authUser);
  const canDeleteDustbins = canDeleteGarbageBins(authUser);
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    binId: "",
    deviceId: "",
    fillPercentage: "0",
    assignedUserId: "",
    zone: "",
    locationLabel: "",
    deviceStatus: "Active"
  });
  const [editingBinId, setEditingBinId] = useState("");
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [selectedBinId, setSelectedBinId] = useState("");
  const [latest, setLatest] = useState(null);
  const [dustbins, setDustbins] = useState([]);
  const [iotDevices, setIotDevices] = useState([]);
  const [residents, setResidents] = useState([]);
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
    () => dustbins.find((bin) => bin.binId === selectedBinId) ?? dustbins[0] ?? null,
    [dustbins, selectedBinId]
  );
  const selectedResident = useMemo(
    () => residents.find((resident) => String(resident.id) === String(formData.assignedUserId)) ?? null,
    [residents, formData.assignedUserId]
  );
  const selectedDevice = useMemo(
    () => iotDevices.find((device) => device.deviceId === formData.deviceId) ?? null,
    [iotDevices, formData.deviceId]
  );
  const garbageMonitoringSectionRefs = useMemo(
    () => ({
      [GARBAGE_MONITORING_SECTION_KEYS.form]: formSectionRef,
      [GARBAGE_MONITORING_SECTION_KEYS.management]: managementSectionRef
    }),
    []
  );
  const rememberGarbageMonitoringSection = useSectionReturn(
    "admin-garbage-monitoring",
    garbageMonitoringSectionRefs,
    !status.loading
  );
  const requestedBinId = String(searchParams.get("bin") || "").trim();
  const requestedEditBinId = String(searchParams.get("edit") || "").trim();
  const currentFormBinId = String(formData.binId || "").trim();

  function getBinLabel(bin) {
    return String(bin?.binId || "").trim() || `Record #${bin?.id}`;
  }

  function buildSensorPrefix(resident) {
    const rawPrefix = String(resident?.houseNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return rawPrefix || `R${resident?.id || "00"}`;
  }

  function buildAutoSensorId(resident, currentRecordId = null) {
    if (!resident) {
      return "";
    }

    const assignedBins = dustbins.filter(
      (bin) =>
        String(bin.assignedUserId) === String(resident.id) &&
        (!currentRecordId || Number(bin.id) !== Number(currentRecordId))
    );

    const usedIds = new Set(
      assignedBins
        .map((bin) => String(bin.binId || "").trim().toUpperCase())
        .filter(Boolean)
    );

    const prefix = buildSensorPrefix(resident);
    let sequence = assignedBins.length + 1;

    while (sequence < 1000) {
      const candidate = `${prefix}-${String(sequence).padStart(2, "0")}`;
      if (!usedIds.has(candidate)) {
        return candidate;
      }
      sequence += 1;
    }

    return `${prefix}-${Date.now()}`;
  }

  useEffect(() => {
    loadGarbageData();
  }, []);

  useEffect(() => {
    const successMessage = location.state?.success;
    if (!successMessage) {
      return;
    }

    setToast({
      kind: "success",
      message: successMessage
    });
    setStatus((current) => ({
      ...current,
      success: successMessage
    }));
    navigate(location.pathname + location.search, {
      replace: true,
      state: {}
    });
  }, [location.pathname, location.search, location.state, navigate]);

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

  useEffect(() => {
    if (!canUpdateDustbins) {
      return;
    }

    if (!requestedEditBinId || dustbins.length === 0) {
      return;
    }

    const binToEdit = dustbins.find((bin) => String(bin.binId) === requestedEditBinId);
    if (!binToEdit || editingRecordId === binToEdit.id) {
      return;
    }

    setEditingBinId(binToEdit.binId);
    setEditingRecordId(binToEdit.id);
    setSelectedBinId(binToEdit.binId);
    setFormData({
      binId: binToEdit.binId || "",
      deviceId: binToEdit.deviceId ?? "",
      fillPercentage: String(binToEdit.fillPercentage),
      assignedUserId: String(binToEdit.assignedUserId ?? ""),
      zone: binToEdit.zone ?? "General",
      locationLabel: binToEdit.locationLabel ?? "",
      deviceStatus: binToEdit.deviceStatus ?? "Active"
    });
    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));
  }, [canUpdateDustbins, requestedEditBinId, dustbins, editingRecordId]);

  async function loadGarbageData({ preserveMessages = false } = {}) {
    try {
      const [binData, residentData] = await Promise.all([
        getGarbageBins(),
        getActiveResidents()
      ]);
      const detectedDevices = await getIotDevices();
      let latestData = null;

      try {
        latestData = await getLatestGarbageStatus();
      } catch (error) {
        if (binData.length > 0) {
          throw error;
        }
      }

      setLatest(latestData);
      setDustbins(binData);
      setIotDevices(detectedDevices);
      setResidents(residentData);
      setSelectedBinId((current) => {
        if (requestedBinId && binData.some((bin) => String(bin.binId) === requestedBinId)) {
          return requestedBinId;
        }
        return current || binData[0]?.binId || "";
      });
      setStatus((current) => ({
        ...current,
        loading: false,
        error: preserveMessages ? current.error : "",
        success: preserveMessages ? current.success : ""
      }));
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message,
        success: ""
      });
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;

    if (name === "assignedUserId") {
      const resident = residents.find((item) => String(item.id) === String(value)) ?? null;
      const autoBinId = buildAutoSensorId(resident, editingRecordId);
      setFormData((current) => ({
        ...current,
        assignedUserId: value,
        binId: autoBinId,
        fillPercentage: editingBinId ? current.fillPercentage : "0",
        zone: resident?.zone || "General",
        locationLabel: resident
          ? [resident.houseNo ? `House ${resident.houseNo}` : "", resident.address || ""]
              .filter(Boolean)
              .join(", ")
          : "",
        deviceStatus: selectedDevice?.deviceStatus || current.deviceStatus || "Active"
      }));
      return;
    }

    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleToggleDeviceSelection(device) {
    setFormData((current) => ({
      ...current,
      deviceId: current.deviceId === device.deviceId ? "" : device.deviceId,
      deviceStatus:
        current.deviceId === device.deviceId
          ? "Active"
          : device.deviceStatus || current.deviceStatus || "Active"
    }));
    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));
  }

  function openDustbinDetails(binId) {
    if (!binId) {
      return;
    }

    rememberGarbageMonitoringSection(GARBAGE_MONITORING_SECTION_KEYS.management);
    navigate(`/admin/garbage-monitoring/${encodeURIComponent(binId)}`);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));

    const normalizedBinId = String(formData.binId || "").trim();
    const isEditing = Boolean(editingRecordId);

    if (isEditing && !canUpdateDustbins) {
      setStatus((current) => ({
        ...current,
        error: "You do not have access to update dustbins."
      }));
      return;
    }

    if (!isEditing && !canManageDustbins) {
      setStatus((current) => ({
        ...current,
        error: "Only system administrators can create new dustbins."
      }));
      return;
    }

    if (!String(formData.assignedUserId || "").trim()) {
      setStatus((current) => ({
        ...current,
        error: "Please select a resident before creating or updating a dustbin."
      }));
      return;
    }

    if (!normalizedBinId) {
      setStatus((current) => ({
        ...current,
        error: "Bin ID is required before creating or updating a dustbin."
      }));
      return;
    }

    try {
      const payload = {
        binId: normalizedBinId,
        fillPercentage: Number(formData.fillPercentage),
        assignedUserId: Number(formData.assignedUserId),
        deviceId: formData.deviceId,
        zone: formData.zone,
        locationLabel: formData.locationLabel,
        deviceStatus: formData.deviceStatus
      };

      const response = isEditing
          ? await updateGarbageBin(
            {
              id: editingRecordId,
              binId: editingBinId
            },
            payload
          )
          : await createGarbageReading({
            binId: normalizedBinId,
            deviceId: formData.deviceId,
            fillPercentage: Number(formData.fillPercentage),
            assignedUserId: Number(formData.assignedUserId),
            zone: formData.zone,
            locationLabel: formData.locationLabel,
            deviceStatus: formData.deviceStatus
          });

      const savedBinId = String(response?.reading?.binId || normalizedBinId).trim();
      const successMessage = editingRecordId
        ? `Dustbin ${savedBinId} updated successfully.`
        : `Successfully created new dustbin ${savedBinId}.`;

      setToast({
        kind: "success",
        message: successMessage
      });
      setStatus((current) => ({
        ...current,
        success: successMessage
      }));
      setFormData({
        binId: "",
        deviceId: "",
        fillPercentage: "0",
        assignedUserId: "",
        zone: "",
        locationLabel: "",
        deviceStatus: "Active"
      });
      setEditingBinId("");
      setEditingRecordId(null);

      await loadGarbageData({ preserveMessages: true });
      setSelectedBinId(editingBinId || savedBinId);
    } catch (error) {
      setToast({
        kind: "error",
        message: error.message
      });
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    }
  }

  function handleCancelEdit() {
    const cancelMessage = editingBinId
      ? `Editing for dustbin ${editingBinId} was canceled.`
      : "Dustbin editing was canceled.";

    setToast({
      kind: "info",
      message: cancelMessage
    });
    setStatus((current) => ({
      ...current,
      error: "",
      success: cancelMessage
    }));
    setEditingBinId("");
    setEditingRecordId(null);
    setFormData({
      binId: "",
      deviceId: "",
      fillPercentage: "0",
      assignedUserId: "",
      zone: "",
      locationLabel: "",
      deviceStatus: "Active"
    });
    navigate("/admin/garbage-monitoring", {
      replace: true
    });
  }

  async function handleDeleteEditingDustbin() {
    if (!editingRecordId || !canDeleteDustbins) {
      return;
    }

    const selectedEditingBin = dustbins.find((bin) => Number(bin.id) === Number(editingRecordId));
    if (!selectedEditingBin) {
      setStatus((current) => ({
        ...current,
        error: "The selected dustbin could not be found for deletion."
      }));
      return;
    }

    const confirmed = window.confirm(`Delete dustbin ${selectedEditingBin.binId} and remove its assignment?`);
    if (!confirmed) {
      const cancelMessage = `Delete action for dustbin ${selectedEditingBin.binId} was canceled.`;
      setToast({
        kind: "info",
        message: cancelMessage
      });
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
      const response = await deleteGarbageBin(selectedEditingBin);
      setToast({
        kind: "success",
        message: response.message
      });
      setStatus((current) => ({
        ...current,
        success: response.message
      }));
      setEditingBinId("");
      setEditingRecordId(null);
      setFormData({
        binId: "",
        deviceId: "",
        fillPercentage: "0",
        assignedUserId: "",
        zone: "",
        locationLabel: "",
        deviceStatus: "Active"
      });
      await loadGarbageData({ preserveMessages: true });
      navigate("/admin/garbage-monitoring", {
        replace: true,
        state: {
          success: response.message
        }
      });
    } catch (error) {
      setToast({
        kind: "error",
        message: error.message
      });
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    }
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
          <p className="page-kicker">Smart Infrastructure</p>
          <h1>Garbage monitoring</h1>
          <p className="page-description">Manage dustbins, devices, and assignments.</p>
        </div>
      </section>

      {canManageDustbins || (canUpdateDustbins && (editingRecordId || requestedEditBinId)) ? (
        <div ref={formSectionRef}>
        <SectionCard
          title={editingRecordId ? `Edit Dustbin ${editingBinId || `Record #${editingRecordId}`}` : "Create Dustbin"}
          subtitle={editingRecordId ? "Update dustbin details" : "Create and assign a dustbin"}
        >
          <div className="info-banner">
            {editingRecordId
              ? "Update the selected dustbin."
              : "Each dustbin must be linked to one resident."}
          </div>
          <form className="form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Bin ID
              <input
                name="binId"
                type="text"
                value={formData.binId}
                readOnly
              />
            </label>
            <label>
              Assigned resident
              <select name="assignedUserId" value={formData.assignedUserId} onChange={handleChange}>
                <option value="">
                  {residents.length > 0 ? "Select a resident" : "No active residents available"}
                </option>
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} - {resident.houseNo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="info-grid mt-lg">
            <div className="info-box">
              <span>Resident Name</span>
              <strong>{selectedResident?.name || "Not selected"}</strong>
            </div>
            <div className="info-box">
              <span>House No</span>
              <strong>{selectedResident?.houseNo || "-"}</strong>
            </div>
            <div className="info-box">
              <span>Phone</span>
              <strong>{selectedResident?.phone || "-"}</strong>
            </div>
            <div className="info-box">
              <span>Email</span>
              <strong>{selectedResident?.email || "-"}</strong>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Selected IoT Device ID
              <input
                name="deviceId"
                type="text"
                value={formData.deviceId || "No device selected"}
                readOnly
              />
            </label>
            <label>
              Device Status
              {editingRecordId ? (
                <select
                  name="deviceStatus"
                  value={formData.deviceStatus}
                  onChange={handleChange}
                >
                  <option value="Active">Active</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Inactive">Inactive</option>
                </select>
              ) : (
                <input
                  name="deviceStatus"
                  type="text"
                  value={selectedDevice?.deviceStatus || formData.deviceStatus}
                  readOnly
                />
              )}
            </label>
          </div>

          <div className="form-grid">
            <label>
              Fill Percentage
              <input
                name="fillPercentage"
                type="number"
                min="0"
                max="100"
                value={formData.fillPercentage}
                readOnly
              />
            </label>
            <label>
              Zone / Area
              <input
                name="zone"
                type="text"
                value={formData.zone}
                readOnly
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Dustbin Location
              <input
                name="locationLabel"
                type="text"
                value={formData.locationLabel}
                readOnly
              />
            </label>
          </div>

          <div className="stack-sm mt-lg">
            <strong>Detected IoT devices</strong>
            <p className="muted-text">
              Select a device. Assigned devices stay locked.
            </p>
            {iotDevices.length === 0 ? (
              <p className="muted-text">No IoT devices yet.</p>
            ) : (
              <div className="iot-device-table-wrap">
                <table className="iot-device-table">
                  <thead>
                    <tr>
                      <th>MAC Address</th>
                      <th>Linked Sensor</th>
                      <th>Resident</th>
                      <th>Last Seen</th>
                      <th>IP Address</th>
                      <th>Contact Type</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iotDevices.map((device) => {
                      const isSelected = formData.deviceId === device.deviceId;
                      const linkedSensorId = String(device.linkedSensorId || "").trim();
                      const isAssignedElsewhere =
                        Boolean(linkedSensorId) &&
                        linkedSensorId !== currentFormBinId;
                      const actionLabel = isSelected
                        ? "Deselect Device"
                        : isAssignedElsewhere
                          ? `Assigned to ${linkedSensorId}`
                          : "Select Device";

                      return (
                        <tr key={device.deviceId} className={isSelected ? "iot-device-row-selected" : ""}>
                          <td>{device.deviceId}</td>
                          <td>{linkedSensorId || "Not linked"}</td>
                          <td>{device.residentName || "Not assigned"}</td>
                          <td>{formatNepalDateTime(device.lastSeenAt)}</td>
                          <td>{device.lastIpAddress || "-"}</td>
                          <td>{device.lastContactType}</td>
                          <td>
                            {isAssignedElsewhere ? (
                              <span className="device-lock-label">{actionLabel}</span>
                            ) : (
                              <button
                                type="button"
                                className={`button ${isSelected ? "button-danger" : "button-secondary"}`}
                                onClick={() => handleToggleDeviceSelection(device)}
                              >
                                {actionLabel}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="muted-text">
            Resident selection fills sensor ID, zone, and location.
          </p>
          {status.error ? <p className="status-message status-error">{status.error}</p> : null}
          {status.success ? <p className="status-message status-success">{status.success}</p> : null}
          <div className="button-row">
            <button type="submit" className="button">
              {editingBinId ? "Update Dustbin" : "Create Dustbin"}
            </button>
            {editingBinId ? (
              <button type="button" className="button button-secondary" onClick={handleCancelEdit}>
                Cancel Edit
              </button>
            ) : null}
            {editingBinId && canDeleteDustbins ? (
              <button type="button" className="button button-danger" onClick={handleDeleteEditingDustbin}>
                Delete Dustbin
              </button>
            ) : null}
          </div>
          </form>

          {latest ? (
            <div className="info-grid mt-lg">
              <div className="info-box">
                <span>Latest Dustbin</span>
                <strong>{latest.binId}</strong>
              </div>
              <div className="info-box">
                <span>Latest Fill</span>
                <strong>{getGarbageDisplayState(latest, latest.status).fillLabel}</strong>
              </div>
              <div className="info-box">
                <span>Current Status</span>
                <strong>{getGarbageDisplayState(latest, latest.status).statusLabel}</strong>
              </div>
            </div>
          ) : null}
        </SectionCard>
        </div>
      ) : null}

      <div ref={managementSectionRef}>
      <SectionCard title="Dustbin Management" subtitle="Open a dustbin">
        {dustbins.length === 0 ? <p className="muted-text">No dustbins yet.</p> : null}
        <div className="stack-sm">
          {dustbins.map((bin) => {
            const binDisplay = getGarbageDisplayState(bin, bin.status);

            return (
              <button
                key={`${bin.id}-${bin.binId}`}
                type="button"
                className={`list-item dustbin-management-row ${selectedBin?.id === bin.id ? "dustbin-management-row-active" : ""}`}
                onClick={() => openDustbinDetails(bin.binId)}
              >
                <div className="dustbin-card-copy">
                  <strong className="item-title">Dustbin {getBinLabel(bin)}</strong>
                  <p className="muted-text">
                    Resident: {bin.assignedUserName ?? "Not assigned"}
                  </p>
                  <p className="muted-text">
                    Latest fill {binDisplay.fillLabel} - Status {binDisplay.statusLabel} - Zone {bin.zone ?? "General"}
                  </p>
                  <small>{bin.locationLabel ?? "Location not set"} - {formatNepalDateTime(bin.timestamp)}</small>
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>
      </div>
    </div>
  );
}

export default GarbageMonitoringPage;
