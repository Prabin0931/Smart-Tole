/*
 * Project note: Resident Dashboard Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { EMERGENCY_CONTACTS } from "../../data/emergencyContacts";
import useSectionReturn from "../../hooks/useSectionReturn";
import { SERVICE_MODULES, getServiceModuleByCategory } from "../../data/serviceModules";
import { getResidentComplaints } from "../../services/complaintApi";
import { getGarbageBins, getLatestGarbageStatus } from "../../services/garbageApi";
import { getNotices } from "../../services/noticeApi";
import { getAuthUser } from "../../utils/authStorage";
import { getGarbageDisplayState } from "../../utils/garbageStatus";

const RESIDENT_DASHBOARD_SECTION_KEYS = {
  welcome: "welcome",
  overview: "overview",
  dustbins: "dustbins",
  services: "services",
  notices: "notices"
};

function ResidentDashboardPage() {
  const authUser = getAuthUser();
  const welcomeSectionRef = useRef(null);
  const overviewSectionRef = useRef(null);
  const dustbinSectionRef = useRef(null);
  const servicesSectionRef = useRef(null);
  const noticesSectionRef = useRef(null);
  const [notices, setNotices] = useState([]);
  const [latestReading, setLatestReading] = useState(null);
  const [residentComplaints, setResidentComplaints] = useState([]);
  const [assignedDustbins, setAssignedDustbins] = useState([]);
  const [highlightedBinId, setHighlightedBinId] = useState("");
  const highlightedDustbin = assignedDustbins.find((bin) => String(bin.binId) === String(highlightedBinId)) || null;
  const residentDashboardSectionRefs = useMemo(
    () => ({
      [RESIDENT_DASHBOARD_SECTION_KEYS.welcome]: welcomeSectionRef,
      [RESIDENT_DASHBOARD_SECTION_KEYS.overview]: overviewSectionRef,
      [RESIDENT_DASHBOARD_SECTION_KEYS.dustbins]: dustbinSectionRef,
      [RESIDENT_DASHBOARD_SECTION_KEYS.services]: servicesSectionRef,
      [RESIDENT_DASHBOARD_SECTION_KEYS.notices]: noticesSectionRef
    }),
    []
  );
  const rememberResidentDashboardSection = useSectionReturn("resident-dashboard", residentDashboardSectionRefs, true);
  const activeBinDisplay = getGarbageDisplayState(
    highlightedDustbin ?? latestReading ?? null,
    highlightedDustbin?.status ?? latestReading?.status ?? "Unknown"
  );
  const activeBinStatus = activeBinDisplay.statusLabel;
  const activeBinTone = activeBinDisplay.statusTone;

  useEffect(() => {
    async function loadPageData() {
      try {
        const [noticeData, complaintData, dustbinData] = await Promise.all([
          getNotices(authUser?.zone),
          authUser?.id ? getResidentComplaints(authUser.id) : Promise.resolve([]),
          authUser?.id ? getGarbageBins(authUser.id) : Promise.resolve([])
        ]);
        let garbageData = null;

        try {
          garbageData = await getLatestGarbageStatus(authUser?.id);
        } catch {
          garbageData = null;
        }

        setNotices(noticeData);
        setResidentComplaints(complaintData);
        setAssignedDustbins(dustbinData);
        setHighlightedBinId((current) => current || dustbinData[0]?.binId || "");
        setLatestReading(garbageData);
      } catch {
        setNotices([]);
        setResidentComplaints([]);
        setAssignedDustbins([]);
        setHighlightedBinId("");
        setLatestReading(null);
      }
    }

    loadPageData();
  }, [authUser?.id, authUser?.zone]);

  return (
    <div className="stack-lg">
      <div ref={welcomeSectionRef}>
      <SectionCard
        title={`Welcome${authUser?.fullName ? `, ${authUser.fullName}` : ""}`}
        subtitle="Overview"
      >
        <div className="hero-inline">
          <div>
            <p>Use the shortcuts below to report issues and check updates.</p>
          </div>
        </div>
        <div className="button-row mt-lg">
          <Link className="button" to="/resident/complaints/new" onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.welcome)}>New Complaint</Link>
          <Link className="button button-secondary" to="/resident/complaints" onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.welcome)}>View Complaints</Link>
        </div>
      </SectionCard>
      </div>

      <div ref={overviewSectionRef} className="grid-3">
        <StatCard label="Active Notices" value={notices.length} to="/resident/notices" onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.overview)} />
        <StatCard label="My Complaints" value={residentComplaints.length} to="/resident/complaints" onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.overview)} />
        <StatCard label="Garbage Bin Status" value={activeBinStatus} tone={activeBinTone} to="/resident/garbage-status" onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.overview)} />
      </div>

      <div ref={dustbinSectionRef}>
      <SectionCard title="Dustbin Status" subtitle="Assigned dustbins">
        {assignedDustbins.length === 0 ? <p className="muted-text">No dustbin assigned yet.</p> : null}
        <div className="dustbin-grid">
          {assignedDustbins.map((bin) => {
            const binDisplay = getGarbageDisplayState(bin, bin.status);

            return (
              <Link
                key={bin.binId}
                className={`dustbin-tile ${highlightedBinId === bin.binId ? "dustbin-tile-active" : ""}`}
                to={`/resident/garbage-status?bin=${encodeURIComponent(bin.binId)}`}
                onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.dustbins)}
                onMouseEnter={() => setHighlightedBinId(bin.binId)}
                onFocus={() => setHighlightedBinId(bin.binId)}
              >
                <span className="dustbin-tile-kicker">Dustbin {bin.binId}</span>
                <strong>{binDisplay.statusLabel}</strong>
                <p>{bin.locationLabel ?? bin.assignedAddress ?? "Assigned Area"}</p>
                <small>{binDisplay.fillLabel} - Zone {bin.zone ?? "General"}</small>
              </Link>
            );
          })}
        </div>
      </SectionCard>
      </div>

      <div ref={servicesSectionRef}>
      <SectionCard title="Essential Community Services" subtitle="Choose a service area">
        <div className="service-module-grid">
          {SERVICE_MODULES.map((module) => {
            const moduleComplaints = residentComplaints.filter((complaint) => getServiceModuleByCategory(complaint.category).id === module.id);
            const activeCount = moduleComplaints.filter((complaint) => complaint.status !== "Resolved").length;
            const resolvedCount = moduleComplaints.filter((complaint) => complaint.status === "Resolved").length;

            return (
              <Link
                key={module.id}
                className="service-module-card service-module-card-link"
                to={`/resident/complaints?module=${module.id}`}
                onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.services)}
              >
                <span className="material-symbols-outlined">{module.icon}</span>
                <strong>{module.shortLabel}</strong>
                <p>{module.description}</p>
                <div className="service-module-metrics">
                  <small>Total: {moduleComplaints.length}</small>
                  <small>Active: {activeCount}</small>
                  <small>Resolved: {resolvedCount}</small>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>
      </div>

      <div className="grid-2-admin">
        <div ref={noticesSectionRef}>
        <SectionCard title="Recent Notices">
          <div className="stack-sm">
            {notices.slice(0, 3).map((notice) => (
              <Link key={notice.notice_id} className="list-item list-item-link" to={`/resident/notices?notice=${notice.notice_id}`} onClick={() => rememberResidentDashboardSection(RESIDENT_DASHBOARD_SECTION_KEYS.notices)}>
                <strong>{notice.title}</strong>
                <p>{notice.description}</p>
                <small>{notice.date}</small>
              </Link>
            ))}
            {notices.length === 0 ? <p className="muted-text">No notices have been published yet.</p> : null}
          </div>
        </SectionCard>
        </div>

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
    </div>
  );
}

export default ResidentDashboardPage;
