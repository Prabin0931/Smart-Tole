/*
 * Project note: Admin Reports Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { SERVICE_MODULES, getServiceModuleByCategory } from "../../data/serviceModules";
import { downloadReport, getAnalyticsSummary, getCommitteeAdmins, getReportSummary } from "../../services/adminApi";
import { getAllComplaints, getSlaOverview, runSlaEscalationNow } from "../../services/complaintApi";
import { getGarbageBins } from "../../services/garbageApi";
import { getNotices } from "../../services/noticeApi";
import { filterComplaintsForAdminRole, getDefaultAdminComplaintsPath, isSystemAdministrator } from "../../utils/adminAccess";
import { getComplaintTrackingFlags, summarizeComplaintTracking } from "../../utils/complaintTracking";
import { getAuthUser } from "../../utils/authStorage";
import { buildCommitteeActivityCard } from "../../utils/committeeActivity";
import { formatNepalDateTime } from "../../utils/dateTime";

const AREA_TONE_CYCLE = ["brand", "accent", "success", "info", "alert"];
const REPORT_SECTION_STORAGE_KEY = "adminReportsReturnSection";
const REPORT_SECTION_KEYS = {
  overview: "overview",
  deadline: "deadline",
  committee: "committee",
  snapshot: "snapshot",
  priority: "priority",
  zone: "zone",
  dustbins: "dustbins"
};

function getPriorityTone(priority) {
  const normalizedPriority = String(priority || "").trim().toLowerCase();

  if (normalizedPriority.includes("high")) {
    return "danger";
  }

  if (normalizedPriority.includes("medium")) {
    return "warning";
  }

  if (normalizedPriority.includes("low")) {
    return "success";
  }

  return "brand";
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsvFile(filename, columns, rows) {
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildCommitteeComplaintRoute(adminId, { view, statusFilter } = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("assignedAdminId", String(adminId));

  if (view) {
    searchParams.set("view", view);
  }

  if (statusFilter) {
    searchParams.set("statusFilter", statusFilter);
  }

  return `/admin/complaints?${searchParams.toString()}`;
}

function buildCommitteeNoticesRoute(adminId) {
  const searchParams = new URLSearchParams();
  searchParams.set("section", "published");
  searchParams.set("authorId", String(adminId));
  return `/admin/notices?${searchParams.toString()}`;
}

function buildCommitteeDetailRoute(adminId) {
  return `/admin/reports/committee/${adminId}`;
}

function AdminReportsPage() {
  const authUser = getAuthUser();
  const navigate = useNavigate();
  const overviewSectionRef = useRef(null);
  const deadlineSectionRef = useRef(null);
  const committeeSectionRef = useRef(null);
  const snapshotSectionRef = useRef(null);
  const prioritySectionRef = useRef(null);
  const zoneSectionRef = useRef(null);
  const dustbinSectionRef = useRef(null);
  const [analytics, setAnalytics] = useState(null);
  const [report, setReport] = useState(null);
  const [committeeUsers, setCommitteeUsers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notices, setNotices] = useState([]);
  const [dustbins, setDustbins] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    info: ""
  });
  const { toast, showSuccess, showError, clearToast } = useActionToast();
  const [exportingType, setExportingType] = useState("");
  const [slaOverview, setSlaOverview] = useState(null);
  const [slaJobRunning, setSlaJobRunning] = useState(false);
  const complaintRoute = getDefaultAdminComplaintsPath(authUser);
  const reportsSectionRefs = useMemo(
    () => ({
      [REPORT_SECTION_KEYS.overview]: overviewSectionRef,
      [REPORT_SECTION_KEYS.deadline]: deadlineSectionRef,
      [REPORT_SECTION_KEYS.committee]: committeeSectionRef,
      [REPORT_SECTION_KEYS.snapshot]: snapshotSectionRef,
      [REPORT_SECTION_KEYS.priority]: prioritySectionRef,
      [REPORT_SECTION_KEYS.zone]: zoneSectionRef,
      [REPORT_SECTION_KEYS.dustbins]: dustbinSectionRef
    }),
    []
  );
  const visibleComplaints = useMemo(
    () => filterComplaintsForAdminRole(complaints, authUser),
    [authUser, complaints]
  );
  const complaintDeadlineOverview = useMemo(() => {
    return summarizeComplaintTracking(visibleComplaints);
  }, [visibleComplaints]);
  const visibleModuleOverview = useMemo(() => {
    return SERVICE_MODULES.map((module) => {
      const moduleComplaints = visibleComplaints.filter(
        (complaint) => getServiceModuleByCategory(complaint.category).id === module.id
      );

      if (!moduleComplaints.length) {
        return null;
      }

      const summary = moduleComplaints.reduce(
        (current, complaint) => {
          const flags = getComplaintTrackingFlags(complaint);

          current.total += 1;
          if (flags.isResolved) {
            current.resolved += 1;
          }
          if (flags.isOverdue) {
            current.overdue += 1;
          }
          if (flags.isDueToday) {
            current.dueToday += 1;
          }
          if (flags.isUrgentReview) {
            current.escalated += 1;
          }

          return current;
        },
        {
          total: 0,
          resolved: 0,
          overdue: 0,
          dueToday: 0,
          escalated: 0
        }
      );

      return {
        moduleId: module.id,
        moduleLabel: module.shortLabel,
        ...summary
      };
    }).filter(Boolean);
  }, [visibleComplaints]);
  const reportTagCards = useMemo(() => {
    if (!report) {
      return [];
    }

    return [
      {
        label: "Complaints Still Open",
        value: Math.max(visibleComplaints.length - complaintDeadlineOverview.resolved, 0),
        tone: "info",
        to: complaintRoute
      },
      {
        label: "Notices Shared",
        value: report.notices,
        tone: "accent",
        to: "/admin/notices?section=published"
      },
      {
        label: "Dustbins Registered",
        value: report.dustbins,
        tone: "success",
        to: "/admin/garbage-monitoring"
      },
      {
        label: "Full Dustbins",
        value: report.fullDustbins,
        tone: "danger",
        to: "/admin/garbage-monitoring"
      },
      {
        label: "Warning Dustbins",
        value: report.warningDustbins,
        tone: "warning",
        to: "/admin/garbage-monitoring"
      }
    ];
  }, [complaintDeadlineOverview.resolved, complaintRoute, report, visibleComplaints.length]);
  const priorityOverviewCards = useMemo(() => {
    const counts = new Map();

    visibleComplaints.forEach((complaint) => {
      const priority = complaint.priority || "Medium";
      counts.set(priority, (counts.get(priority) || 0) + 1);
    });

    const entries = Array.from(counts.entries()).map(([priority, total]) => ({ priority, total }));

    if (!entries.length) {
      return [];
    }

    const highestCount = Math.max(...entries.map((item) => item.total || 0), 1);

    return entries.map((item) => ({
      ...item,
      tone: getPriorityTone(item.priority),
      barWidth: Math.max(((item.total || 0) / highestCount) * 100, item.total > 0 ? 10 : 0)
    }));
  }, [visibleComplaints]);
  const zoneOverviewCards = useMemo(() => {
    const counts = new Map();

    visibleComplaints.forEach((complaint) => {
      const zone = complaint.zone || "General";
      counts.set(zone, (counts.get(zone) || 0) + 1);
    });

    const entries = Array.from(counts.entries())
      .map(([zone, total]) => ({ zone, total }))
      .sort((a, b) => b.total - a.total || a.zone.localeCompare(b.zone));

    if (!entries.length) {
      return [];
    }

    const highestCount = Math.max(...entries.map((item) => item.total || 0), 1);

    return entries.map((item, index) => ({
      ...item,
      tone: AREA_TONE_CYCLE[index % AREA_TONE_CYCLE.length],
      barWidth: Math.max(((item.total || 0) / highestCount) * 100, item.total > 0 ? 10 : 0)
    }));
  }, [visibleComplaints]);
  const dustbinZoneOverviewCards = useMemo(() => {
    if (!analytics?.dustbinsByZone?.length) {
      return [];
    }

    const highestCount = Math.max(...analytics.dustbinsByZone.map((item) => item.total_bins || 0), 1);

    return analytics.dustbinsByZone.map((item, index) => ({
      ...item,
      tone: AREA_TONE_CYCLE[index % AREA_TONE_CYCLE.length],
      totalWidth: Math.max(((item.total_bins || 0) / highestCount) * 100, item.total_bins > 0 ? 10 : 0),
      warningWidth: Math.max((((item.warning_bins || 0) / Math.max(item.total_bins || 0, 1)) * 100), item.warning_bins > 0 ? 10 : 0),
      fullWidth: Math.max((((item.full_bins || 0) / Math.max(item.total_bins || 0, 1)) * 100), item.full_bins > 0 ? 10 : 0)
    }));
  }, [analytics]);
  const committeeActivityCards = useMemo(() => {
    return committeeUsers
      .filter((user) => !isSystemAdministrator(user))
      .map((user) => buildCommitteeActivityCard(user, complaints, notices, dustbins))
      .sort((a, b) => {
        if (b.overdue !== a.overdue) {
          return b.overdue - a.overdue;
        }
        if (b.urgent !== a.urgent) {
          return b.urgent - a.urgent;
        }
        if (b.active !== a.active) {
          return b.active - a.active;
        }
        return a.name.localeCompare(b.name);
      });
  }, [committeeUsers, complaints, dustbins, notices]);

  useEffect(() => {
    async function loadReports() {
      try {
        const [analyticsData, reportData, slaData, complaintData, committeeData, noticeData, dustbinData] = await Promise.all([
          getAnalyticsSummary(),
          getReportSummary(),
          getSlaOverview(),
          getAllComplaints(),
          getCommitteeAdmins(),
          getNotices(),
          getGarbageBins()
        ]);

        setAnalytics(analyticsData);
        setReport(reportData);
        setSlaOverview(slaData);
        setComplaints(complaintData);
        setCommitteeUsers(committeeData);
        setNotices(Array.isArray(noticeData) ? noticeData : []);
        setDustbins(Array.isArray(dustbinData) ? dustbinData : []);
        setStatus({
          loading: false,
          error: "",
          info: ""
        });
      } catch (error) {
        setStatus({
          loading: false,
          error: error.message,
          info: ""
        });
      }
    }

    loadReports();
  }, []);

  useEffect(() => {
    if (status.loading) {
      return;
    }

    const savedSection = sessionStorage.getItem(REPORT_SECTION_STORAGE_KEY);

    if (!savedSection) {
      return;
    }

    const sectionRef = reportsSectionRefs[savedSection];

    if (!sectionRef?.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      sessionStorage.removeItem(REPORT_SECTION_STORAGE_KEY);
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [reportsSectionRefs, status.loading]);

  function rememberReportsSection(sectionKey) {
    sessionStorage.setItem(REPORT_SECTION_STORAGE_KEY, sectionKey);
  }

  async function handleExport(type) {
    setExportingType(type);
    setStatus((current) => ({
      ...current,
      error: ""
    }));

    try {
      if (type === "complaints") {
        downloadCsvFile(
          "complaints-report.csv",
          [
            "complaint_id",
            "name",
            "email",
            "phone",
            "category",
            "priority",
            "status",
            "zone",
            "escalated",
            "due_date",
            "assigned_admin_name",
            "assigned_committee",
            "created_at"
          ],
          visibleComplaints
        );
      } else {
        await downloadReport(type);
      }
      const reportName = type ? `${type.charAt(0).toUpperCase()}${type.slice(1)}` : "Summary";
      showSuccess(`${reportName} report exported successfully.`);
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    } finally {
      setExportingType("");
    }
  }

  async function refreshSlaOverview() {
    try {
      const data = await getSlaOverview();
      setSlaOverview(data);
    } catch {
      // Keep current UI state if refresh fails.
    }
  }

  async function handleRunSlaNow() {
    setSlaJobRunning(true);
    setStatus((current) => ({
      ...current,
      error: ""
    }));

    try {
      const result = await runSlaEscalationNow();
      await refreshSlaOverview();
      showSuccess(`${result.escalatedCount} complaints marked for urgent review by the deadline check.`);
      setStatus((current) => ({
        ...current,
        error: "",
        info: `${result.escalatedCount} complaints marked for urgent review by the deadline check.`
      }));
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    } finally {
      setSlaJobRunning(false);
    }
  }

  return (
    <div className="stack-lg">
      <ActionToast kind={toast.kind} message={toast.message} onClose={clearToast} />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Reports And Analytics</p>
          <h1>Management reports</h1>
          <p className="page-description">View reports and trends.</p>
        </div>
        <div className="button-row reports-primary-actions">
          <button type="button" className="button button-secondary" onClick={() => handleExport("summary")} disabled={Boolean(exportingType)}>
            {exportingType === "summary" ? "Preparing Export..." : "Export Summary Report"}
          </button>
          <button type="button" className="button" onClick={handleRunSlaNow} disabled={slaJobRunning}>
            {slaJobRunning ? "Checking Deadlines..." : "Complaint Deadline Check"}
          </button>
        </div>
      </section>

      {status.loading ? <p>Loading reports...</p> : null}
      {status.error ? <p className="status-message status-error">{status.error}</p> : null}
      {status.info ? <p className="status-message status-success">{status.info}</p> : null}

      {report ? (
        <div ref={overviewSectionRef} className="grid-4">
          <StatCard label="Residents" value={report.residents} to="/admin/residents" onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.overview)} />
          <StatCard label="Total Complaints" value={visibleComplaints.length} to={complaintRoute} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.overview)} />
          <StatCard label="Published Notices" value={report.notices} to="/admin/notices?section=published" onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.overview)} />
          <StatCard label="Registered Dustbins" value={report.dustbins} to="/admin/garbage-monitoring" onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.overview)} />
        </div>
      ) : null}

      {slaOverview ? (
        <div ref={deadlineSectionRef}>
        <SectionCard title="Complaint Deadline Overview" subtitle={`Updated ${new Date(slaOverview.generatedAt).toLocaleString()}`}>
          <div className="grid-4">
            <StatCard label="Overdue" value={complaintDeadlineOverview.overdue} tone="danger" to={`${complaintRoute}${complaintRoute.includes("?") ? "&" : "?"}view=overdue`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.deadline)} />
            <StatCard
              label="Due Today"
              value={complaintDeadlineOverview.dueToday}
              tone="warning"
              onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.deadline)}
              to={`${complaintRoute}${complaintRoute.includes("?") ? "&" : "?"}view=due-today`}
            />
            <StatCard label="Urgent Review" value={complaintDeadlineOverview.escalated} tone="warning" to={`${complaintRoute}${complaintRoute.includes("?") ? "&" : "?"}view=escalated`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.deadline)} />
            <StatCard label="On Track" value={complaintDeadlineOverview.onTrack} to={`${complaintRoute}${complaintRoute.includes("?") ? "&" : "?"}view=on-track`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.deadline)} />
          </div>
          <div className="grid-4 reports-deadline-secondary-row">
            <StatCard label="Resolved" value={complaintDeadlineOverview.resolved} to={`${complaintRoute}${complaintRoute.includes("?") ? "&" : "?"}view=resolved`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.deadline)} />
              <StatCard
                label="Complaint Resolution Rate"
                value={`${complaintDeadlineOverview.total ? Math.round((complaintDeadlineOverview.resolved / complaintDeadlineOverview.total) * 100) : 0}%`}
                to={complaintRoute}
                onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.deadline)}
              />
          </div>
          <div className="reports-module-guide mt-lg">
            <div className="reports-module-legend">
              <span className="reports-module-legend-item">
                <i className="reports-module-legend-dot reports-module-legend-dot-brand" aria-hidden="true"></i>
                All Cases
              </span>
              <span className="reports-module-legend-item">
                <i className="reports-module-legend-dot reports-module-legend-dot-success" aria-hidden="true"></i>
                Solved
              </span>
              <span className="reports-module-legend-item">
                <i className="reports-module-legend-dot reports-module-legend-dot-danger" aria-hidden="true"></i>
                Overdue
              </span>
              <span className="reports-module-legend-item">
                <i className="reports-module-legend-dot reports-module-legend-dot-warning" aria-hidden="true"></i>
                Due Today
              </span>
              <span className="reports-module-legend-item">
                <i className="reports-module-legend-dot reports-module-legend-dot-alert" aria-hidden="true"></i>
                Urgent Review
              </span>
            </div>
          </div>
          <div className="reports-module-graph mt-lg">
            {visibleModuleOverview.map((item) => (
              <Link key={item.moduleId} className="reports-module-card list-item-link" to={`/admin/complaints?module=${item.moduleId}`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.deadline)}>
                <div className="reports-module-card-header">
                  <div>
                    <strong>{item.moduleLabel}</strong>
                    <p className="reports-module-summary">{item.total || 0} total Â· {item.resolved ?? 0} solved Â· {item.overdue || 0} overdue</p>
                  </div>
                  <span className="muted-text">View</span>
                </div>
                <div className="reports-module-bar-grid">
                  {[
                    { label: "All Cases", value: item.total || 0, tone: "brand" },
                    { label: "Solved", value: item.resolved ?? 0, tone: "success" },
                    { label: "Overdue", value: item.overdue || 0, tone: "danger" },
                    { label: "Due Today", value: item.dueToday || 0, tone: "warning" },
                    { label: "Urgent Review", value: item.escalated || 0, tone: "alert" }
                  ].map((metric) => (
                    <div key={metric.label} className="reports-module-bar-row">
                      <div className="reports-module-bar-copy">
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                      <div className="reports-module-bar-track" aria-hidden="true">
                        <div
                          className={`reports-module-bar-fill reports-module-bar-fill-${metric.tone}`}
                          style={{
                            width: `${Math.max(
                              metric.label === "All Cases"
                                ? metric.value > 0
                                  ? 100
                                  : 0
                                : ((metric.value || 0) / Math.max(item.total || 0, 1)) * 100,
                              metric.value > 0 ? 8 : 0
                            )}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
            {visibleModuleOverview.length === 0 ? <p className="muted-text">No complaint services assigned.</p> : null}
          </div>
        </SectionCard>
        </div>
      ) : null}

      {isSystemAdministrator(authUser) ? (
        <div ref={committeeSectionRef}>
        <SectionCard title="Committee Daily Activity" subtitle="Open a card to view details.">
          <div className="reports-committee-grid">
            {committeeActivityCards.map((user) => (
              <article
                key={user.id}
                className="reports-breakdown-card reports-breakdown-card-tone-brand reports-committee-overview-card"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  if (event.target.closest("a, button")) {
                    return;
                  }

                  rememberReportsSection(REPORT_SECTION_KEYS.committee);
                  navigate(`/admin/reports/committee/${user.id}`);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }

                  event.preventDefault();
                  rememberReportsSection(REPORT_SECTION_KEYS.committee);
                  navigate(`/admin/reports/committee/${user.id}`);
                }}
                >
                  <div className="reports-breakdown-card-head">
                    <div>
                      <div className="reports-committee-name-row">
                        <strong>{user.name}</strong>
                      </div>
                      <p className="reports-breakdown-card-copy">{user.roleLabel}</p>
                    </div>
                    <span
                      className={`reports-committee-account-text ${
                        String(user.accountStatus || "").toLowerCase() === "active"
                          ? "reports-committee-account-text-active"
                          : "reports-committee-account-text-inactive"
                      }`}
                    >
                      {user.accountStatus}
                    </span>
                  </div>
                  <div className="reports-committee-status-row">
                    <div className="reports-committee-status-group">
                      <span
                        className={`reports-committee-status-text reports-committee-status-text-${user.status.label
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {user.status.label}
                      </span>
                      <span className="reports-committee-open-text">Open: {user.active}</span>
                    </div>
                  </div>
                <div className="reports-committee-activity-links">
                  <Link
                    className="reports-committee-activity-copy reports-committee-inline-link"
                    to={buildCommitteeDetailRoute(user.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      rememberReportsSection(REPORT_SECTION_KEYS.committee);
                    }}
                  >
                    Today Updates: {user.complaintUpdatesToday}
                    <small>{user.latestComplaintUpdateAt ? formatNepalDateTime(user.latestComplaintUpdateAt) : "-"}</small>
                  </Link>
                  <Link
                    className="reports-committee-activity-copy reports-committee-inline-link"
                    to={buildCommitteeNoticesRoute(user.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      rememberReportsSection(REPORT_SECTION_KEYS.committee);
                    }}
                  >
                    Today Notices: {user.noticesToday}
                    <small>{user.latestNoticeTodayAt ? formatNepalDateTime(user.latestNoticeTodayAt) : "-"}</small>
                  </Link>
                  {user.managedBins > 0 ? (
                    <Link
                      className="reports-committee-activity-copy reports-committee-inline-link"
                      to="/admin/garbage-monitoring"
                      onClick={(event) => {
                        event.stopPropagation();
                        rememberReportsSection(REPORT_SECTION_KEYS.committee);
                      }}
                    >
                      Bin Alerts: {user.attentionBins}
                      <small>{user.latestAttentionBinAt ? formatNepalDateTime(user.latestAttentionBinAt) : "-"}</small>
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
            {committeeActivityCards.length === 0 ? <p className="muted-text">No committee users to track yet.</p> : null}
          </div>
        </SectionCard>
        </div>
      ) : null}

      {report ? (
        <div ref={snapshotSectionRef}>
        <SectionCard title="Quick Management Snapshot" subtitle={`Updated ${new Date(report.generatedAt).toLocaleString()}`}>
          <div className="button-row mb-md">
            <button type="button" className="button button-secondary" onClick={() => handleExport("complaints")} disabled={Boolean(exportingType)}>
              {exportingType === "complaints" ? "Preparing Export..." : "Export Complaint Report"}
            </button>
            <button type="button" className="button button-secondary" onClick={() => handleExport("residents")} disabled={Boolean(exportingType)}>
              {exportingType === "residents" ? "Preparing Export..." : "Export Resident Report"}
            </button>
            <button type="button" className="button button-secondary" onClick={() => handleExport("notices")} disabled={Boolean(exportingType)}>
              {exportingType === "notices" ? "Preparing Export..." : "Export Notice Report"}
            </button>
            <button type="button" className="button button-secondary" onClick={() => handleExport("dustbins")} disabled={Boolean(exportingType)}>
              {exportingType === "dustbins" ? "Preparing Export..." : "Export Dustbin Report"}
            </button>
          </div>
          <div className="reports-summary-grid">
            {reportTagCards.map((tag) => (
              <Link key={tag.label} className={`reports-summary-card reports-summary-card-tone-${tag.tone || "brand"} info-box-link`} to={tag.to} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.snapshot)}>
                <div className="reports-summary-card-head">
                  <span>{tag.label}</span>
                  <strong>{tag.value}</strong>
                </div>
                <div className="reports-summary-card-track" aria-hidden="true">
                  <div
                    className={`reports-summary-card-fill reports-summary-card-fill-${tag.tone || "brand"}`}
                    style={{
                      width: `${Math.max(
                        (tag.value / Math.max(...reportTagCards.map((item) => item.value || 0), 1)) * 100,
                        tag.value > 0 ? 10 : 0
                      )}%`
                    }}
                  ></div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
        </div>
      ) : null}

      {analytics ? (
        <div className="grid-2-admin">
          <div ref={prioritySectionRef}>
          <SectionCard title="Complaint Pressure By Priority" subtitle="By priority">
            <div className="reports-breakdown-list">
              {priorityOverviewCards.map((item) => (
                <Link key={item.priority} className={`reports-breakdown-card reports-breakdown-card-tone-${item.tone} list-item-link`} to={`/admin/complaints?priority=${encodeURIComponent(item.priority)}`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.priority)}>
                  <div className="reports-breakdown-card-head">
                    <strong>{item.priority} Priority</strong>
                    <span>{item.total} complaints</span>
                  </div>
                  <div className="reports-module-bar-track" aria-hidden="true">
                    <div className={`reports-module-bar-fill reports-module-bar-fill-${item.tone}`} style={{ width: `${item.barWidth}%` }}></div>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
          </div>

          <div ref={zoneSectionRef}>
          <SectionCard title="Complaints By Area" subtitle="By area">
            <div className="reports-breakdown-list">
              {zoneOverviewCards.map((item) => (
                <Link key={item.zone} className={`reports-breakdown-card reports-breakdown-card-tone-${item.tone} list-item-link`} to={`/admin/complaints?zone=${encodeURIComponent(item.zone)}`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.zone)}>
                  <div className="reports-breakdown-card-head">
                    <strong>{item.zone}</strong>
                    <span>{item.total} complaints</span>
                  </div>
                  <div className="reports-module-bar-track" aria-hidden="true">
                    <div className={`reports-module-bar-fill reports-module-bar-fill-${item.tone}`} style={{ width: `${item.barWidth}%` }}></div>
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
          </div>
        </div>
      ) : null}

      {analytics ? (
        <div ref={dustbinSectionRef}>
        <SectionCard title="Dustbin Status By Area" subtitle="By area">
          <div className="reports-breakdown-list">
            {dustbinZoneOverviewCards.map((item) => (
              <Link key={item.zone} className={`reports-breakdown-card reports-breakdown-card-tone-${item.tone} list-item-link`} to={`/admin/garbage-monitoring?zone=${encodeURIComponent(item.zone)}`} onClick={() => rememberReportsSection(REPORT_SECTION_KEYS.dustbins)}>
                <div className="reports-breakdown-card-head">
                  <strong>{item.zone}</strong>
                  <span>{item.total_bins} monitored dustbins</span>
                </div>
                <div className="reports-module-bar-grid">
                  {[
                    { label: "Monitored Dustbins", value: item.total_bins, tone: item.tone, width: item.totalWidth },
                    { label: "Warning Bins", value: item.warning_bins, tone: "warning", width: item.warningWidth },
                    { label: "Full Bins", value: item.full_bins, tone: "danger", width: item.fullWidth }
                  ].map((metric) => (
                    <div key={`${item.zone}-${metric.label}`} className="reports-module-bar-row">
                      <div className="reports-module-bar-copy">
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                      <div className="reports-module-bar-track" aria-hidden="true">
                        <div className={`reports-module-bar-fill reports-module-bar-fill-${metric.tone}`} style={{ width: `${metric.width}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
            {dustbinZoneOverviewCards.length === 0 ? <p className="muted-text">No dustbin analytics yet.</p> : null}
          </div>
        </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

export default AdminReportsPage;
