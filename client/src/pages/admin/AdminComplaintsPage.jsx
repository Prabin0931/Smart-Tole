/*
 * Project note: Admin Complaints Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import { getRoleLabel } from "../../data/committeeRoles";
import { SERVICE_MODULES, getServiceModuleByCategory } from "../../data/serviceModules";
import { getAllComplaints, updateComplaint } from "../../services/complaintApi";
import { getCommitteeAdmins } from "../../services/adminApi";
import { filterComplaintsForAdminRole, isSystemAdministrator } from "../../utils/adminAccess";
import { getComplaintTrackingFlags, getTrackingToday, matchesComplaintTrackingView } from "../../utils/complaintTracking";
import { getAuthUser } from "../../utils/authStorage";

function AdminComplaintsPage() {
  const authUser = getAuthUser();
  const isSystemAdmin = isSystemAdministrator(authUser);
  const location = useLocation();
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    success: ""
  });
  const [draggedComplaintId, setDraggedComplaintId] = useState(null);
  const [dropTargetStatus, setDropTargetStatus] = useState("");
  const [selectedComplaintIds, setSelectedComplaintIds] = useState([]);
  const [committeeAdmins, setCommitteeAdmins] = useState([]);
  const [bulkAssignedAdminId, setBulkAssignedAdminId] = useState("");
  const [ticketAssignmentSelection, setTicketAssignmentSelection] = useState({});
  const { toast, showSuccess, showError, clearToast } = useActionToast();

  useEffect(() => {
    loadComplaints();
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
    navigate(location.pathname + location.search, {
      replace: true,
      state: {}
    });
  }, [location.pathname, location.search, location.state, navigate]);

  async function loadComplaints() {
    try {
      const [data, admins] = await Promise.all([getAllComplaints(), getCommitteeAdmins()]);
      setComplaints(data);
      setCommitteeAdmins(admins);
      setTicketAssignmentSelection((current) => {
        const next = { ...current };
        data.forEach((complaint) => {
          if (complaint.assigned_admin_id && !next[complaint.complaint_id]) {
            next[complaint.complaint_id] = String(complaint.assigned_admin_id);
          }
        });
        return next;
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

  const queryParams = new URLSearchParams(location.search);
  const moduleQuery = queryParams.get("module");
  const viewQuery = queryParams.get("view");
  const ownerQuery = queryParams.get("owner");
  const assignedAdminIdQuery = queryParams.get("assignedAdminId");
  const statusFilterQuery = queryParams.get("statusFilter");
  const priorityQuery = queryParams.get("priority");
  const zoneQuery = queryParams.get("zone");
  const modeQuery = queryParams.get("mode") === "board" ? "board" : "list";
  const effectiveModuleQuery = isSystemAdmin ? moduleQuery : "";
  const effectiveOwnerQuery = isSystemAdmin ? ownerQuery : "";
  const effectiveAssignedAdminIdQuery = isSystemAdmin ? assignedAdminIdQuery : "";
  const today = getTrackingToday();
  const roleFilteredComplaints = useMemo(
    () => filterComplaintsForAdminRole(complaints, authUser),
    [complaints, authUser]
  );
  const activeCommitteeAdmins = useMemo(
    () => committeeAdmins.filter((admin) => String(admin.accountStatus || "Active") === "Active"),
    [committeeAdmins]
  );
  const complaintsByModule = effectiveModuleQuery
    ? roleFilteredComplaints.filter((complaint) => getServiceModuleByCategory(complaint.category).id === effectiveModuleQuery)
    : roleFilteredComplaints;
  const complaintsByOwner = complaintsByModule.filter((complaint) => {
    if (effectiveOwnerQuery === "mine") {
      return Number(complaint.assigned_admin_id) === Number(authUser?.id);
    }
    if (effectiveOwnerQuery === "unassigned") {
      return !complaint.assigned_admin_id;
    }
    return true;
  });
  const complaintsByAssignedAdmin = effectiveAssignedAdminIdQuery
    ? complaintsByOwner.filter((complaint) => Number(complaint.assigned_admin_id) === Number(effectiveAssignedAdminIdQuery))
    : complaintsByOwner;
  const complaintsByStatus = complaintsByAssignedAdmin.filter((complaint) => {
    if (statusFilterQuery === "active") {
      return complaint.status !== "Resolved";
    }

    return true;
  });
  const complaintsByPriority = priorityQuery
    ? complaintsByStatus.filter((complaint) => String(complaint.priority || "").toLowerCase() === String(priorityQuery).toLowerCase())
    : complaintsByStatus;
  const complaintsByZone = zoneQuery ? complaintsByPriority.filter((complaint) => (complaint.zone || "General") === zoneQuery) : complaintsByPriority;
  const filteredComplaints = complaintsByZone.filter((complaint) =>
    matchesComplaintTrackingView(complaint, viewQuery, today)
  );

  const moduleCounts = SERVICE_MODULES.map((module) => ({
    ...module,
    total: roleFilteredComplaints.filter((complaint) => getServiceModuleByCategory(complaint.category).id === module.id).length
  }));
  const zoneCounts = useMemo(() => {
    const map = new Map();
    complaintsByOwner.forEach((complaint) => {
      const zone = complaint.zone || "General";
      map.set(zone, (map.get(zone) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([zone, total]) => ({ zone, total }))
      .sort((a, b) => b.total - a.total || a.zone.localeCompare(b.zone));
  }, [complaintsByOwner]);

  const statusColumns = useMemo(
    () => [
      { key: "Pending", label: "Pending" },
      { key: "In Progress", label: "In Progress" },
      { key: "Resolved", label: "Resolved" }
    ],
    []
  );

  const workloadSummary = useMemo(() => {
    const map = new Map();
    filteredComplaints.forEach((complaint) => {
      const owner = complaint.assigned_admin_name || getRoleLabel(complaint.assigned_committee) || "Unassigned";
      if (!map.has(owner)) {
        map.set(owner, { owner, total: 0, active: 0, escalated: 0 });
      }
      const row = map.get(owner);
      row.total += 1;
      if (complaint.status !== "Resolved") {
        row.active += 1;
      }
      if (complaint.escalated) {
        row.escalated += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.active - a.active || b.total - a.total);
  }, [filteredComplaints]);

  const filteredComplaintIds = useMemo(
    () => filteredComplaints.map((complaint) => complaint.complaint_id),
    [filteredComplaints]
  );

  useEffect(() => {
    setSelectedComplaintIds((current) =>
      current.filter((complaintId) => filteredComplaintIds.includes(complaintId))
    );
  }, [filteredComplaintIds]);

  function buildRoute(overrides = {}) {
    const next = new URLSearchParams(location.search);

    if (!isSystemAdmin) {
      next.delete("owner");
      next.delete("module");
      next.delete("assignedAdminId");
    }

    Object.entries(overrides).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    const query = next.toString();
    return query ? `/admin/complaints?${query}` : "/admin/complaints";
  }

  function nextPriority(currentPriority) {
    if (currentPriority === "Low") {
      return "Medium";
    }
    if (currentPriority === "Medium") {
      return "High";
    }
    return "Low";
  }

  function addDays(baseDate, days) {
    const value = baseDate ? new Date(baseDate) : new Date();
    value.setDate(value.getDate() + days);
    return value.toISOString().slice(0, 10);
  }

  function getAssignedCommitteeByAdminId(adminId, fallbackCommittee = "General Committee") {
    const admin = committeeAdmins.find((item) => Number(item.id) === Number(adminId));
    return admin?.roleType || fallbackCommittee;
  }

  function buildAssignmentOverrides(adminId, fallbackCommittee = "General Committee") {
    return {
      assignedAdminId: adminId || null,
      assignedCommittee: getAssignedCommitteeByAdminId(adminId, fallbackCommittee)
    };
  }

  function getComplaintAssignmentText(complaint) {
    const assignedUserName = String(complaint.assigned_admin_name || "").trim();
    const assignedCommitteeLabel = getRoleLabel(complaint.assigned_committee || "General Committee");
    const assignmentLabel = complaint.status === "Resolved" ? "Resolved By" : "Assigned To";

    if (assignedUserName) {
      return `${assignmentLabel}: ${assignedUserName} - ${assignedCommitteeLabel}`;
    }

    if (complaint.assigned_committee) {
      return complaint.status === "Resolved"
        ? `Resolved By: ${assignedCommitteeLabel}`
        : `Assigned Committee: ${assignedCommitteeLabel}`;
    }

    return complaint.status === "Resolved" ? "Resolved By: Unassigned" : "Assigned To: Unassigned";
  }

  async function moveComplaintToStatus(complaintId, targetStatus) {
    const complaint = complaints.find((item) => item.complaint_id === complaintId);

    if (!complaint || complaint.status === targetStatus) {
      return;
    }

    await applyComplaintQuickUpdate(complaint, { status: targetStatus }, `Complaint moved to ${targetStatus}.`);
    setDraggedComplaintId(null);
    setDropTargetStatus("");
  }

  function buildUpdatePayload(complaint, overrides = {}) {
    return {
      status: overrides.status || complaint.status,
      adminRemark: complaint.admin_remark || "",
      priority: overrides.priority || complaint.priority || "Medium",
      dueDate:
        overrides.dueDate !== undefined
          ? overrides.dueDate
          : complaint.due_date
            ? new Date(complaint.due_date).toISOString().slice(0, 10)
            : null,
      escalated: overrides.escalated !== undefined ? overrides.escalated : Boolean(complaint.escalated),
      assignedAdminId:
        overrides.assignedAdminId !== undefined
          ? overrides.assignedAdminId
          : complaint.assigned_admin_id || null,
      assignedCommittee:
        overrides.assignedCommittee || complaint.assigned_committee || "General Committee"
    };
  }

  async function applyComplaintQuickUpdate(complaint, overrides, successMessage) {
    setStatus((current) => ({
      ...current,
      loading: true,
      error: "",
      success: ""
    }));

    try {
      await updateComplaint(complaint.complaint_id, buildUpdatePayload(complaint, overrides));

      showSuccess(successMessage);
      setStatus((current) => ({
        ...current,
        loading: false,
        success: successMessage
      }));
      await loadComplaints();
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        loading: false,
        error: error.message
      }));
    }
  }

  function isComplaintSelected(complaintId) {
    return selectedComplaintIds.includes(complaintId);
  }

  function toggleComplaintSelection(complaintId) {
    setSelectedComplaintIds((current) =>
      current.includes(complaintId)
        ? current.filter((id) => id !== complaintId)
        : [...current, complaintId]
    );
  }

  function toggleSelectAllVisible() {
    const allVisibleSelected =
      filteredComplaintIds.length > 0 &&
      filteredComplaintIds.every((complaintId) => selectedComplaintIds.includes(complaintId));

    if (allVisibleSelected) {
      setSelectedComplaintIds((current) =>
        current.filter((complaintId) => !filteredComplaintIds.includes(complaintId))
      );
      return;
    }

    setSelectedComplaintIds((current) => {
      const merged = new Set([...current, ...filteredComplaintIds]);
      return Array.from(merged);
    });
  }

  async function applyBulkUpdate(overrides, successMessage) {
    if (!selectedComplaintIds.length) {
      return;
    }

    const selectedComplaints = complaints.filter((complaint) =>
      selectedComplaintIds.includes(complaint.complaint_id)
    );

    if (!selectedComplaints.length) {
      return;
    }

    setStatus((current) => ({
      ...current,
      loading: true,
      error: "",
      success: ""
    }));

    try {
      await Promise.all(
        selectedComplaints.map((complaint) =>
          updateComplaint(complaint.complaint_id, buildUpdatePayload(complaint, overrides))
        )
      );

      showSuccess(`${selectedComplaints.length} complaints updated. ${successMessage}`);
      setStatus((current) => ({
        ...current,
        loading: false,
        success: `${selectedComplaints.length} complaints updated. ${successMessage}`
      }));
      setSelectedComplaintIds([]);
      await loadComplaints();
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        loading: false,
        error: error.message
      }));
    }
  }

  return (
    <div className="stack-lg">
      <ActionToast kind={toast.kind} message={toast.message} onClose={clearToast} />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Complaint Review</p>
          <h1>Manage resident complaints</h1>
          <p className="page-description">Review and update complaints.</p>
        </div>
      </section>

      <SectionCard title="Complaint Queue" subtitle="Open a complaint to review it">
        <div className="service-filter-row">
          <Link className={`service-filter-chip ${modeQuery === "list" ? "service-filter-chip-active" : ""}`} to={buildRoute({ mode: null })}>
            List View
          </Link>
          <Link className={`service-filter-chip ${modeQuery === "board" ? "service-filter-chip-active" : ""}`} to={buildRoute({ mode: "board" })}>
            Operations Board
          </Link>
        </div>
        <div className="service-filter-row">
          <Link
            className={`service-filter-chip ${!viewQuery ? "service-filter-chip-active" : ""}`}
            to={buildRoute({ view: null })}
          >
            All Views
          </Link>
          <Link
            className={`service-filter-chip ${viewQuery === "overdue" ? "service-filter-chip-active" : ""}`}
            to={buildRoute({ view: "overdue" })}
          >
            Overdue
          </Link>
          <Link
            className={`service-filter-chip ${viewQuery === "due-today" ? "service-filter-chip-active" : ""}`}
            to={buildRoute({ view: "due-today" })}
          >
            Due Today
          </Link>
          <Link
            className={`service-filter-chip ${viewQuery === "escalated" ? "service-filter-chip-active" : ""}`}
            to={buildRoute({ view: "escalated" })}
          >
            Urgent Review
          </Link>
          <Link
            className={`service-filter-chip ${viewQuery === "on-track" ? "service-filter-chip-active" : ""}`}
            to={buildRoute({ view: "on-track" })}
          >
            On Track
          </Link>
        </div>
        {isSystemAdmin ? (
          <>
            <div className="service-filter-row">
              <Link
                className={`service-filter-chip ${!effectiveOwnerQuery ? "service-filter-chip-active" : ""}`}
                to={buildRoute({ owner: null })}
              >
                All Assignments
              </Link>
              <Link
                className={`service-filter-chip ${effectiveOwnerQuery === "mine" ? "service-filter-chip-active" : ""}`}
                to={buildRoute({ owner: "mine" })}
              >
                My Assigned Complaints
              </Link>
              <Link
                className={`service-filter-chip ${effectiveOwnerQuery === "unassigned" ? "service-filter-chip-active" : ""}`}
                to={buildRoute({ owner: "unassigned" })}
              >
                Waiting For Assignment
              </Link>
            </div>
            <div className="service-filter-row">
              <Link className={`service-filter-chip ${!effectiveModuleQuery ? "service-filter-chip-active" : ""}`} to={buildRoute({ module: null })}>
                All Services ({roleFilteredComplaints.length})
              </Link>
              {moduleCounts.map((module) => (
                <Link
                  key={module.id}
                  className={`service-filter-chip ${effectiveModuleQuery === module.id ? "service-filter-chip-active" : ""}`}
                  to={buildRoute({ module: module.id })}
                >
                  {module.shortLabel} ({module.total})
                </Link>
              ))}
            </div>
          </>
        ) : null}
        <div className="service-filter-row">
          <Link className={`service-filter-chip ${!zoneQuery ? "service-filter-chip-active" : ""}`} to={buildRoute({ zone: null })}>
            All Zones ({complaintsByOwner.length})
          </Link>
          {zoneCounts.map((item) => (
            <Link key={item.zone} className={`service-filter-chip ${zoneQuery === item.zone ? "service-filter-chip-active" : ""}`} to={buildRoute({ zone: item.zone })}>
              {item.zone} ({item.total})
            </Link>
          ))}
        </div>
        <div className="bulk-action-bar">
          <button type="button" className="button button-secondary table-action-button" onClick={toggleSelectAllVisible}>
            {filteredComplaintIds.length > 0 && filteredComplaintIds.every((complaintId) => selectedComplaintIds.includes(complaintId))
              ? "Clear Shown Choices"
              : "Choose All Shown"}
          </button>
          <span className="bulk-action-count">{selectedComplaintIds.length} complaints chosen</span>
          {isSystemAdmin ? (
            <>
              <select
                className="service-filter-chip bulk-assign-select"
                value={bulkAssignedAdminId}
                onChange={(event) => setBulkAssignedAdminId(event.target.value)}
              >
                <option value="">Choose committee user</option>
                {activeCommitteeAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name} - {getRoleLabel(admin.roleType)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-secondary table-action-button"
                disabled={!selectedComplaintIds.length || !bulkAssignedAdminId}
                onClick={() =>
                  applyBulkUpdate(
                    buildAssignmentOverrides(Number(bulkAssignedAdminId)),
                    "Assigned selected complaints to the selected committee user."
                  )
                }
              >
                Assign Chosen Complaints
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="button button-secondary table-action-button"
            disabled={!selectedComplaintIds.length}
            onClick={() => applyBulkUpdate({ escalated: true }, "Marked selected complaints for urgent review.")}
          >
            Mark For Urgent Review
          </button>
          <button
            type="button"
            className="button button-secondary table-action-button"
            disabled={!selectedComplaintIds.length}
            onClick={() => applyBulkUpdate({ escalated: false }, "Removed urgent review from selected complaints.")}
          >
            Clear Urgent Review
          </button>
          <button
            type="button"
            className="button button-secondary table-action-button"
            disabled={!selectedComplaintIds.length}
            onClick={() => applyBulkUpdate({ status: "Pending" }, "Moved selected complaints to Pending.")}
          >
            Move To Pending
          </button>
          <button
            type="button"
            className="button button-secondary table-action-button"
            disabled={!selectedComplaintIds.length}
            onClick={() => applyBulkUpdate({ status: "In Progress" }, "Moved selected complaints to In Progress.")}
          >
            Move To In Progress
          </button>
          <button
            type="button"
            className="button button-secondary table-action-button"
            disabled={!selectedComplaintIds.length}
            onClick={() => applyBulkUpdate({ status: "Resolved", escalated: false }, "Resolved selected complaints.")}
          >
            Resolve Selected
          </button>
        </div>
        {status.loading ? <p>Loading complaints...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {status.success ? <p className="status-message status-success">{status.success}</p> : null}
        {!status.loading && modeQuery === "list" ? (
          <div className="complaint-grid">
            {filteredComplaints.map((complaint) => {
              const serviceModule = getServiceModuleByCategory(complaint.category);

              return (
                <Link
                  key={complaint.complaint_id}
                  className={`complaint-tile ${isComplaintSelected(complaint.complaint_id) ? "complaint-tile-active" : ""}`}
                  to={`/admin/complaints/${complaint.complaint_id}`}
                >
                  <div className="complaint-select-row">
                    <span className="complaint-tile-kicker">{serviceModule.shortLabel}</span>
                    <button
                      type="button"
                      className={`complaint-select-button ${isComplaintSelected(complaint.complaint_id) ? "complaint-select-button-active" : ""}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleComplaintSelection(complaint.complaint_id);
                      }}
                    >
                      {isComplaintSelected(complaint.complaint_id) ? "Chosen" : "Choose"}
                    </button>
                  </div>
                  <strong>{complaint.name}</strong>
                  <p>
                    {complaint.category} - {complaint.priority} Priority
                    {complaint.escalated ? " - Urgent Review" : ""}
                    {complaint.zone ? ` - Zone ${complaint.zone}` : ""}
                  </p>
                  <small>{getComplaintAssignmentText(complaint)}</small>
                  <span className={`pill pill-${complaint.status.toLowerCase().replace(/\s+/g, "-")}`}>
                    {complaint.status}
                  </span>
                </Link>
              );
            })}
            {!filteredComplaints.length ? <p className="muted-text">No complaints found.</p> : null}
          </div>
        ) : null}
        {!status.loading && modeQuery === "board" ? (
          <div className="stack-lg">
            <p className="muted-text">Drag a complaint to change its status.</p>
            <div className="kanban-workload-grid">
              {workloadSummary.slice(0, 4).map((owner) => (
                <article key={owner.owner} className="kanban-workload-card">
                  <strong>{owner.owner}</strong>
                  <p>Active: {owner.active}</p>
                  <small>Total: {owner.total} - Urgent Review: {owner.escalated}</small>
                </article>
              ))}
              {!workloadSummary.length ? <p className="muted-text">No assignment data yet.</p> : null}
            </div>
            <div className="kanban-board">
              {statusColumns.map((column) => {
                const columnComplaints = filteredComplaints.filter((complaint) => complaint.status === column.key);
                return (
                  <section
                    key={column.key}
                    className={`kanban-column ${dropTargetStatus === column.key ? "kanban-column-drop-active" : ""}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropTargetStatus(column.key);
                    }}
                    onDragLeave={() => {
                      if (dropTargetStatus === column.key) {
                        setDropTargetStatus("");
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const droppedId = Number(event.dataTransfer.getData("text/plain"));
                      if (droppedId) {
                        moveComplaintToStatus(droppedId, column.key);
                      } else {
                        setDropTargetStatus("");
                      }
                    }}
                  >
                    <header className="kanban-column-header">
                      <h3>{column.label}</h3>
                      <span>{columnComplaints.length}</span>
                    </header>
                    <div className="kanban-column-body">
                      {columnComplaints.map((complaint) => {
                        const { isOverdue } = getComplaintTrackingFlags(complaint, today);
                        const serviceModule = getServiceModuleByCategory(complaint.category);
                        return (
                          <article
                            key={complaint.complaint_id}
                            className={`kanban-ticket ${draggedComplaintId === complaint.complaint_id ? "kanban-ticket-dragging" : ""} ${isComplaintSelected(complaint.complaint_id) ? "complaint-tile-active" : ""}`}
                            draggable
                            onDragStart={(event) => {
                              setDraggedComplaintId(complaint.complaint_id);
                              event.dataTransfer.setData("text/plain", String(complaint.complaint_id));
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggedComplaintId(null);
                              setDropTargetStatus("");
                            }}
                          >
                            <div className="kanban-ticket-top">
                              <span className="complaint-tile-kicker">{serviceModule.shortLabel}</span>
                              {complaint.escalated ? <span className="kanban-badge kanban-badge-warning">Urgent Review</span> : null}
                              {isOverdue ? <span className="kanban-badge kanban-badge-danger">Overdue</span> : null}
                              <button
                                type="button"
                                className={`complaint-select-button ${isComplaintSelected(complaint.complaint_id) ? "complaint-select-button-active" : ""}`}
                                onClick={() => toggleComplaintSelection(complaint.complaint_id)}
                              >
                                {isComplaintSelected(complaint.complaint_id) ? "Chosen" : "Choose"}
                              </button>
                            </div>
                            <strong>{complaint.name}</strong>
                            <p>{complaint.category} - {complaint.priority} Priority</p>
                            <small>Zone: {complaint.zone || "General"}</small>
                            <small>Due: {complaint.due_date ? new Date(complaint.due_date).toLocaleDateString() : "-"}</small>
                            <small>{getComplaintAssignmentText(complaint)}</small>
                            <div className="kanban-ticket-actions">
                              {isSystemAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    className="button button-secondary table-action-button"
                                    disabled={!ticketAssignmentSelection[complaint.complaint_id]}
                                    onClick={() =>
                                      applyComplaintQuickUpdate(
                                        complaint,
                                        buildAssignmentOverrides(
                                          Number(ticketAssignmentSelection[complaint.complaint_id]),
                                          complaint.assigned_committee || "General Committee"
                                        ),
                                        "Complaint reassigned to selected committee user."
                                      )
                                    }
                                  >
                                    Save Assignment
                                  </button>
                                  <select
                                    className="service-filter-chip bulk-assign-select"
                                    value={ticketAssignmentSelection[complaint.complaint_id] || ""}
                                    onChange={(event) =>
                                      setTicketAssignmentSelection((current) => ({
                                        ...current,
                                        [complaint.complaint_id]: event.target.value
                                      }))
                                    }
                                  >
                                    <option value="">Choose committee user</option>
                                    {activeCommitteeAdmins.map((admin) => (
                                      <option key={admin.id} value={admin.id}>
                                        {admin.name} - {getRoleLabel(admin.roleType)}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : null}
                              <button
                                type="button"
                                className="button button-secondary table-action-button"
                                onClick={() =>
                                  applyComplaintQuickUpdate(
                                    complaint,
                                    { escalated: !complaint.escalated },
                                    complaint.escalated ? "Urgent review removed." : "Complaint marked for urgent review."
                                  )
                                }
                              >
                                {complaint.escalated ? "Remove Quick Attention" : "Mark For Quick Attention"}
                              </button>
                              <button
                                type="button"
                                className="button button-secondary table-action-button"
                                onClick={() =>
                                  applyComplaintQuickUpdate(
                                    complaint,
                                    { priority: nextPriority(complaint.priority) },
                                    `Priority updated to ${nextPriority(complaint.priority)}.`
                                  )
                                }
                              >
                                Priority: {complaint.priority}
                              </button>
                              <button
                                type="button"
                                className="button button-secondary table-action-button"
                                onClick={() =>
                                  applyComplaintQuickUpdate(
                                    complaint,
                                    { dueDate: addDays(complaint.due_date, 0) },
                                    "Due date updated to today."
                                  )
                                }
                              >
                                Set Due Date To Today
                              </button>
                              <button
                                type="button"
                                className="button button-secondary table-action-button"
                                onClick={() =>
                                  applyComplaintQuickUpdate(
                                    complaint,
                                    { dueDate: addDays(complaint.due_date, 1) },
                                    "Due date moved by 1 day."
                                  )
                                }
                              >
                                +1 Day
                              </button>
                              <Link className="button table-action-button" to={`/admin/complaints/${complaint.complaint_id}`}>
                                View Full Complaint
                              </Link>
                            </div>
                          </article>
                        );
                      })}
                      {!columnComplaints.length ? <p className="muted-text">No complaints.</p> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default AdminComplaintsPage;
