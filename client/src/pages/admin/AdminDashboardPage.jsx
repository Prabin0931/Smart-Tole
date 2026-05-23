/*
 * Project note: Admin Dashboard Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import useSectionReturn from "../../hooks/useSectionReturn";
import { getAnalyticsSummary } from "../../services/adminApi";
import { getRoleLabel } from "../../data/committeeRoles";
import { EMERGENCY_CONTACTS } from "../../data/emergencyContacts";
import { SERVICE_MODULES, getServiceModuleByCategory } from "../../data/serviceModules";
import { getAllComplaints, getSlaOverview } from "../../services/complaintApi";
import { getGarbageBins, getLatestGarbageStatus } from "../../services/garbageApi";
import { getNotices } from "../../services/noticeApi";
import { getResidents } from "../../services/residentApi";
import { filterComplaintsForAdminRole, getDefaultAdminComplaintsPath, isSystemAdministrator } from "../../utils/adminAccess";
import { summarizeComplaintTracking } from "../../utils/complaintTracking";
import { formatNepalDateTime } from "../../utils/dateTime";
import { getGarbageDisplayState } from "../../utils/garbageStatus";
import { getAuthUser } from "../../utils/authStorage";

const DASHBOARD_SECTION_KEYS = {
  overview: "overview",
  deadline: "deadline",
  dustbins: "dustbins",
  services: "services",
  priority: "priority",
  zones: "zones"
};

function AdminDashboardPage() {
  const authUser = getAuthUser();
  const overviewSectionRef = useRef(null);
  const deadlineSectionRef = useRef(null);
  const dustbinSectionRef = useRef(null);
  const servicesSectionRef = useRef(null);
  const prioritySectionRef = useRef(null);
  const zonesSectionRef = useRef(null);
  const [analyticsSummary, setAnalyticsSummary] = useState(null);
  const [slaOverview, setSlaOverview] = useState(null);
  const [latestReading, setLatestReading] = useState(null);
  const [selectedBinId, setSelectedBinId] = useState("");
  const [dashboardData, setDashboardData] = useState({
    residents: [],
    complaints: [],
    notices: [],
    dustbins: []
  });

  async function loadDashboardData() {
    try {
      try {
        const [latestData, analyticsData, slaData] = await Promise.all([
          getLatestGarbageStatus(),
          getAnalyticsSummary(),
          getSlaOverview()
        ]);

        setLatestReading(latestData);
        setAnalyticsSummary(analyticsData);
        setSlaOverview(slaData);
      } catch {
        setLatestReading(null);
        setAnalyticsSummary(null);
        setSlaOverview(null);
      }

      const [residentData, complaintData, noticeData, dustbinData] = await Promise.all([
        getResidents(),
        getAllComplaints(),
        getNotices(),
        getGarbageBins()
      ]);

      setDashboardData({
        residents: residentData,
        complaints: complaintData,
        notices: noticeData,
        dustbins: dustbinData
      });
      setSelectedBinId((current) => current || dustbinData[0]?.binId || "");
    } catch {
      setDashboardData({
        residents: [],
        complaints: [],
        notices: [],
        dustbins: []
      });
      setLatestReading(null);
      setAnalyticsSummary(null);
      setSlaOverview(null);
    }
  }

  useEffect(() => {
    loadDashboardData();

    const refreshInterval = setInterval(() => {
      loadDashboardData();
    }, 15000);

    function handleWindowFocus() {
      loadDashboardData();
    }

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  const selectedBin = useMemo(
    () => dashboardData.dustbins.find((dustbin) => dustbin.binId === selectedBinId) ?? dashboardData.dustbins[0] ?? null,
    [dashboardData.dustbins, selectedBinId]
  );

  const activeBinDisplay = getGarbageDisplayState(
    selectedBin ?? latestReading ?? null,
    selectedBin?.status ?? latestReading?.status ?? "Unknown"
  );
  const complaintRoute = getDefaultAdminComplaintsPath(authUser);
  const dashboardSectionRefs = useMemo(
    () => ({
      [DASHBOARD_SECTION_KEYS.overview]: overviewSectionRef,
      [DASHBOARD_SECTION_KEYS.deadline]: deadlineSectionRef,
      [DASHBOARD_SECTION_KEYS.dustbins]: dustbinSectionRef,
      [DASHBOARD_SECTION_KEYS.services]: servicesSectionRef,
      [DASHBOARD_SECTION_KEYS.priority]: prioritySectionRef,
      [DASHBOARD_SECTION_KEYS.zones]: zonesSectionRef
    }),
    []
  );
  const rememberDashboardSection = useSectionReturn("admin-dashboard", dashboardSectionRefs, true);
  const visibleComplaints = useMemo(
    () => filterComplaintsForAdminRole(dashboardData.complaints, authUser),
    [dashboardData.complaints, authUser]
  );

  const complaintOverview = useMemo(() => {
    return summarizeComplaintTracking(
      visibleComplaints,
      slaOverview?.generatedAt ?? new Date().toISOString()
    );
  }, [slaOverview?.generatedAt, visibleComplaints]);

  const activeBinAlert = activeBinDisplay.statusLabel;
  const activeBinTone = activeBinDisplay.statusTone;
  const topStatCards = useMemo(
    () => [
      { label: "Total Residents", value: analyticsSummary?.residentCount ?? dashboardData.residents.length, to: "/admin/residents" },
      { label: "Total Complaints", value: visibleComplaints.length, to: complaintRoute },
      { label: "Published Notices", value: analyticsSummary?.noticeCount ?? dashboardData.notices.length, to: "/admin/notices?section=published" },
      { label: "Current Dustbin Status", value: activeBinAlert, tone: activeBinTone, to: "/admin/garbage-monitoring" }
    ],
    [
      activeBinAlert,
      activeBinTone,
      analyticsSummary?.noticeCount,
      analyticsSummary?.residentCount,
      complaintRoute,
      dashboardData.notices.length,
      dashboardData.residents.length,
      visibleComplaints.length
    ]
  );
  const topStatGridClass =
    topStatCards.length >= 4 ? "grid-4" : topStatCards.length === 3 ? "grid-3" : "grid-2";
  const currentRoleType = String(authUser?.roleType || "").trim();
  const currentRoleLabel = getRoleLabel(currentRoleType);

  const serviceModuleStats = useMemo(
    () =>
      SERVICE_MODULES.map((module) => ({
        ...module,
        total: visibleComplaints.filter((complaint) => getServiceModuleByCategory(complaint.category).id === module.id).length,
        active: visibleComplaints.filter(
          (complaint) =>
            getServiceModuleByCategory(complaint.category).id === module.id &&
            (complaint.status === "Pending" || complaint.status === "In Progress")
        ).length,
        escalated: visibleComplaints.filter(
          (complaint) =>
            getServiceModuleByCategory(complaint.category).id === module.id &&
            complaint.escalated &&
            complaint.status !== "Resolved"
          ).length
      })),
    [visibleComplaints]
  );

  const priorityOverview = useMemo(() => {
    const order = ["High", "Medium", "Low"];
    const counts = new Map();

    visibleComplaints.forEach((complaint) => {
      const priority = complaint.priority || "Medium";
      counts.set(priority, (counts.get(priority) || 0) + 1);
    });

    return order
      .filter((priority) => counts.has(priority))
      .map((priority) => ({
        priority,
        total: counts.get(priority)
      }));
  }, [visibleComplaints]);

  const zoneOverview = useMemo(() => {
    const counts = new Map();

    visibleComplaints.forEach((complaint) => {
      const zone = complaint.zone || "General";
      counts.set(zone, (counts.get(zone) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([zone, total]) => ({ zone, total }))
      .sort((a, b) => b.total - a.total || a.zone.localeCompare(b.zone))
      .slice(0, 4);
  }, [visibleComplaints]);

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Dashboard Overview</p>
          <h1>{`Good day, ${authUser?.name ?? "Administrator"}.`}</h1>
          <p className="page-description">View key activity in one place.</p>
        </div>
      </section>

      <div ref={overviewSectionRef} className={topStatGridClass}>
        {topStatCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            tone={card.tone}
            to={card.to}
            onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.overview)}
          />
        ))}
      </div>

      <div ref={deadlineSectionRef}>
      <SectionCard title="Complaint Deadline Tracking" subtitle={`Updated ${formatNepalDateTime(complaintOverview.generatedAt)}`}>
        <div className="grid-4">
          <StatCard label="Overdue" value={complaintOverview.overdue} tone="danger" to={`${complaintRoute}?view=overdue`} onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.deadline)} />
          <StatCard label="Due Today" value={complaintOverview.dueToday} tone="warning" to={`${complaintRoute}?view=due-today`} onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.deadline)} />
          <StatCard label="Urgent Review" value={complaintOverview.escalated} tone="warning" to={`${complaintRoute}?view=escalated`} onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.deadline)} />
          <StatCard label="On Track" value={complaintOverview.onTrack} to={`${complaintRoute}?view=on-track`} onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.deadline)} />
        </div>
      </SectionCard>
      </div>

      <div ref={dustbinSectionRef}>
      <SectionCard title="Dustbin Status Overview" subtitle="Monitored dustbins">
        <div className="dustbin-grid">
          {dashboardData.dustbins.map((dustbin) => {
            const dustbinDisplay = getGarbageDisplayState(dustbin, dustbin.status);

            return (
              <Link
                key={dustbin.binId}
                className={`dustbin-tile ${selectedBin?.binId === dustbin.binId ? "dustbin-tile-active" : ""}`}
                to={`/admin/garbage-monitoring?bin=${encodeURIComponent(dustbin.binId)}`}
                onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.dustbins)}
                onMouseEnter={() => setSelectedBinId(dustbin.binId)}
                onFocus={() => setSelectedBinId(dustbin.binId)}
              >
                <span className="dustbin-tile-kicker">Dustbin {dustbin.binId}</span>
                <strong>{dustbinDisplay.statusLabel}</strong>
                <small>
                  Resident: {dustbin.assignedUserName ?? "Not assigned"}
                </small>
                <small>
                  {dustbin.locationLabel ?? "Location not set"} - <span className="dustbin-tile-meta-strong">{dustbinDisplay.fillLabel}</span> - Zone{" "}
                  {dustbin.zone ?? "General"}
                </small>
              </Link>
            );
          })}
          {dashboardData.dustbins.length === 0 ? <p className="muted-text">No dustbins yet.</p> : null}
        </div>
      </SectionCard>
      </div>

      <div ref={servicesSectionRef}>
      <SectionCard title="Community Service Areas" subtitle="Open a service area">
        <div className="service-module-grid">
          {serviceModuleStats.map((module) => {
            const showModuleCounts =
              isSystemAdministrator(authUser) ||
              currentRoleType === module.committeeRoleType ||
              currentRoleLabel === module.committeeRoleLabel;

            return (
              <Link
                key={module.id}
                className="service-module-card service-module-card-link"
                to={`/admin/complaints?module=${module.id}`}
                onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.services)}
              >
                <span className="material-symbols-outlined">{module.icon}</span>
                <strong>{module.title}</strong>
                <p>{module.description}</p>
                {showModuleCounts ? (
                  <div className="service-module-metrics">
                    <small>Total: {module.total}</small>
                    <small>Active: {module.active}</small>
                    <small>Urgent: {module.escalated}</small>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </SectionCard>
      </div>

      <div className="grid-2-admin">
        <SectionCard title="Today's Recommended Actions" subtitle="Daily actions">
          <div className="stack-sm">
            <div className="action-row">
              <span className="action-index">01</span>
              <div>
                <strong>Review open complaints</strong>
                <p className="muted-text">Check pending items.</p>
              </div>
            </div>
            <div className="action-row">
              <span className="action-index">02</span>
              <div>
                <strong>Share notices with residents</strong>
                <p className="muted-text">Share updates and notices.</p>
              </div>
            </div>
            <div className="action-row">
              <span className="action-index">03</span>
              <div>
                <strong>Check dustbin readings</strong>
                <p className="muted-text">Check warning and full bins.</p>
              </div>
            </div>
            <div className="action-row">
              <span className="action-index">04</span>
              <div>
                <strong>Follow up urgent complaints</strong>
                <p className="muted-text">Review urgent complaints.</p>
              </div>
            </div>
            <div className="action-row">
              <span className="action-index">05</span>
              <div>
                <strong>Review reports section</strong>
                <p className="muted-text">Open reports and summaries.</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Emergency Help Numbers" subtitle="Nepal emergency contacts">
          <div className="contact-panel">
            <div className="emergency-contact-list">
              {EMERGENCY_CONTACTS.map((contact) => (
                <article key={contact.number} className="emergency-contact-item">
                  <div className="emergency-contact-main">
                    <div className="emergency-contact-copy">
                      <span>{contact.name}</span>
                      <small>{contact.department}</small>
                    </div>
                    <strong>{contact.number}</strong>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid-2-admin">
        <div ref={prioritySectionRef}>
        <SectionCard title="Complaints by Priority" subtitle="Priority overview">
          <div className="stack-sm">
            {priorityOverview.map((item) => (
              <Link
                key={item.priority}
                className="list-item list-item-link"
                to={`/admin/complaints?priority=${encodeURIComponent(item.priority)}`}
                onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.priority)}
              >
                <strong>{item.priority}</strong>
                <p className="muted-text">{item.total} complaints</p>
              </Link>
            ))}
            {priorityOverview.length === 0 ? <p className="muted-text">No complaint analytics yet.</p> : null}
          </div>
        </SectionCard>
        </div>

        <div ref={zonesSectionRef}>
        <SectionCard title="Busy Service Areas" subtitle="Complaint-heavy zones">
          <div className="stack-sm">
            {zoneOverview.map((item) => (
              <Link key={item.zone} className="list-item list-item-link" to={`/admin/complaints?zone=${encodeURIComponent(item.zone)}`} onClick={() => rememberDashboardSection(DASHBOARD_SECTION_KEYS.zones)}>
                <strong>{item.zone}</strong>
                <p className="muted-text">{item.total} complaints</p>
              </Link>
            ))}
            {zoneOverview.length === 0 ? <p className="muted-text">No complaint analytics yet.</p> : null}
          </div>
        </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
