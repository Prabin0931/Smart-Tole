/*
 * Project note: Admin Committee Activity Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import { rememberSectionReturn } from "../../hooks/useSectionReturn";
import { getServiceModuleByCategory } from "../../data/serviceModules";
import { getCommitteeAdmins } from "../../services/adminApi";
import { getAllComplaints } from "../../services/complaintApi";
import { getGarbageBins } from "../../services/garbageApi";
import { getNotices } from "../../services/noticeApi";
import { formatNepalDateTime } from "../../utils/dateTime";
import { buildCommitteeActivityCard, getAssignedAdminId, isSanitationCommitteeRole } from "../../utils/committeeActivity";
import { getGarbageDisplayState } from "../../utils/garbageStatus";

function buildComplaintRoute(adminId, { view, statusFilter } = {}) {
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

function buildNoticeRoute(adminId, noticeId) {
  const searchParams = new URLSearchParams();
  searchParams.set("section", "published");
  searchParams.set("authorId", String(adminId));

  if (noticeId) {
    searchParams.set("notice", String(noticeId));
  }

  return `/admin/notices?${searchParams.toString()}`;
}

function buildBinRoute(binId) {
  return binId ? `/admin/garbage-monitoring/${encodeURIComponent(binId)}` : "/admin/garbage-monitoring";
}

function getComplaintWorkTitle(complaint) {
  const message = String(complaint?.message || "").trim();
  const separatorIndex = message.indexOf(":");

  if (separatorIndex > 0) {
    return message.slice(0, separatorIndex).trim();
  }

  return complaint?.category || "Complaint";
}

function getComplaintWorkDetails(complaint) {
  const parts = [];

  if (complaint?.category) {
    parts.push(complaint.category);
  }
  if (complaint?.priority) {
    parts.push(`${complaint.priority} Priority`);
  }
  if (complaint?.zone) {
    parts.push(`Zone ${complaint.zone}`);
  }

  return parts.join(" - ");
}

function buildActivityRows(committeeUser, activity, complaints, notices, dustbins) {
  const complaintRows = complaints
    .filter((complaint) => getAssignedAdminId(complaint) === Number(committeeUser.id))
    .map((complaint) => ({
      id: `complaint-${complaint.complaint_id}`,
      updatedAt: complaint.updated_at || complaint.created_at || "",
      workType: "Complaint",
      workTitle: getComplaintWorkTitle(complaint),
      serviceArea: getServiceModuleByCategory(complaint.category).shortLabel,
      status: complaint.status || "Pending",
      responsible: `${activity.name} - ${activity.roleLabel}`,
      details: getComplaintWorkDetails(complaint),
      to: `/admin/complaints/${complaint.complaint_id}`
    }));

  const noticeRows = notices
    .filter((notice) => Number(notice.admin_id) === Number(committeeUser.id))
    .map((notice) => ({
      id: `notice-${notice.notice_id}`,
      updatedAt: notice.created_at || notice.date || "",
      workType: "Notice",
      workTitle: notice.title || "Notice",
      serviceArea: notice.target_zone || "All Zones",
      status: "Published",
      responsible: `${activity.name} - ${activity.roleLabel}`,
      details: notice.target_zone ? `Target ${notice.target_zone}` : "Shared with all zones",
      to: buildNoticeRoute(committeeUser.id, notice.notice_id)
    }));

  const dustbinRows = isSanitationCommitteeRole(committeeUser.roleType)
    ? dustbins
        .map((bin) => {
          const display = getGarbageDisplayState(bin, bin.status);
          return {
            bin,
            display
          };
        })
        .filter(
          ({ display }) =>
            display.statusLabel === "Warning" ||
            display.statusLabel === "Full" ||
            display.statusLabel === "Disconnected" ||
            display.statusLabel === "Device Not Assigned"
        )
        .map(({ bin, display }) => ({
          id: `bin-${bin.id || bin.binId}`,
          updatedAt: bin.updated_at || bin.timestamp || bin.lastSeenAt || "",
          workType: "Dustbin",
          workTitle: `Dustbin ${bin.binId || "-"}`,
          serviceArea: bin.zone || "General",
          status: display.statusLabel,
          responsible: `${activity.name} - ${activity.roleLabel}`,
          details: bin.locationLabel || "Location not set",
          to: buildBinRoute(bin.binId)
        }))
    : [];

  return [...complaintRows, ...noticeRows, ...dustbinRows].sort((a, b) => {
    const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return right - left;
  });
}

function AdminCommitteeActivityPage() {
  const { committeeId } = useParams();
  const [committeeUsers, setCommitteeUsers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [notices, setNotices] = useState([]);
  const [dustbins, setDustbins] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    error: ""
  });

  useEffect(() => {
    async function loadPageData() {
      try {
        const [committeeData, complaintData, noticeData, dustbinData] = await Promise.all([
          getCommitteeAdmins(),
          getAllComplaints(),
          getNotices(),
          getGarbageBins()
        ]);

        setCommitteeUsers(Array.isArray(committeeData) ? committeeData : []);
        setComplaints(Array.isArray(complaintData) ? complaintData : []);
        setNotices(Array.isArray(noticeData) ? noticeData : []);
        setDustbins(Array.isArray(dustbinData) ? dustbinData : []);
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

    loadPageData();
  }, []);

  const committeeUser = useMemo(
    () => committeeUsers.find((user) => Number(user.id) === Number(committeeId)) || null,
    [committeeId, committeeUsers]
  );

  const activity = useMemo(() => {
    if (!committeeUser) {
      return null;
    }

    return buildCommitteeActivityCard(committeeUser, complaints, notices, dustbins);
  }, [committeeUser, complaints, notices, dustbins]);

  const activityRows = useMemo(() => {
    if (!committeeUser || !activity) {
      return [];
    }

    return buildActivityRows(committeeUser, activity, complaints, notices, dustbins);
  }, [committeeUser, activity, complaints, notices, dustbins]);

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Committee Activity</p>
          <h1>{activity ? activity.name : "Committee Activity"}</h1>
          <p className="page-description">{activity ? activity.roleLabel : "View committee work log."}</p>
        </div>
        <div className="button-row">
          <Link
            className="button button-secondary"
            to="/admin/reports"
            onClick={() => rememberSectionReturn("admin-reports", "committee")}
          >
            Back To Reports
          </Link>
        </div>
      </section>

      {status.loading ? <p>Loading committee activity...</p> : null}
      {status.error ? <p className="status-message status-error">{status.error}</p> : null}

      {!status.loading && !status.error && !committeeUser ? (
        <SectionCard title="Committee Not Found" subtitle="This record is no longer available.">
          <div className="button-row">
            <Link
              className="button button-secondary"
              to="/admin/reports"
              onClick={() => rememberSectionReturn("admin-reports", "committee")}
            >
              Return To Reports
            </Link>
          </div>
        </SectionCard>
      ) : null}

      {activity ? (
        <>
          <SectionCard title="Committee Daily Track Log" subtitle="Latest work entries.">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Updated</th>
                    <th>Work Type</th>
                    <th>Work Title</th>
                    <th>Service Area</th>
                    <th>Status</th>
                    <th>Responsible Committee User</th>
                    <th>Details</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatNepalDateTime(row.updatedAt)}</td>
                      <td>{row.workType}</td>
                      <td>{row.workTitle}</td>
                      <td>{row.serviceArea}</td>
                      <td>{row.status}</td>
                      <td>{row.responsible}</td>
                      <td>{row.details}</td>
                      <td>
                        <Link className="button button-secondary table-action-button" to={row.to}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activityRows.length === 0 ? <p className="muted-text">No tracked work found yet.</p> : null}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

export default AdminCommitteeActivityPage;
