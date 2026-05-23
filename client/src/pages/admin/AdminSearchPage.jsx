/*
 * Project note: Admin Search Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import { getAllComplaints } from "../../services/complaintApi";
import { getGarbageBins } from "../../services/garbageApi";
import { getNotices } from "../../services/noticeApi";
import { getResidents } from "../../services/residentApi";
import { filterComplaintsForAdminRole } from "../../utils/adminAccess";
import { getGarbageDisplayState } from "../../utils/garbageStatus";
import { getAuthUser } from "../../utils/authStorage";

function matchesQuery(value, query) {
  return String(value ?? "").toLowerCase().includes(query);
}

function AdminSearchPage() {
  const location = useLocation();
  const authUser = getAuthUser();
  const [complaints, setComplaints] = useState([]);
  const [notices, setNotices] = useState([]);
  const [residents, setResidents] = useState([]);
  const [dustbins, setDustbins] = useState([]);
  const [status, setStatus] = useState({
    loading: true,
    error: ""
  });

  const query = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("q") ?? "").trim().toLowerCase();
  }, [location.search]);

  useEffect(() => {
    async function loadSearchData() {
      try {
        const [complaintData, noticeData, residentData, dustbinData] = await Promise.all([
          getAllComplaints(),
          getNotices(),
          getResidents(),
          getGarbageBins()
        ]);

        setComplaints(complaintData);
        setNotices(noticeData);
        setResidents(residentData);
        setDustbins(dustbinData);
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

    loadSearchData();
  }, []);

  const filteredComplaints = useMemo(
    () =>
      filterComplaintsForAdminRole(complaints, authUser).filter(
        (complaint) =>
          !query ||
          matchesQuery(complaint.name, query) ||
          matchesQuery(complaint.email, query) ||
          matchesQuery(complaint.category, query) ||
          matchesQuery(complaint.message, query) ||
          matchesQuery(complaint.status, query)
      ),
    [authUser, complaints, query]
  );

  const filteredNotices = useMemo(
    () =>
      notices.filter(
        (notice) =>
          !query ||
          matchesQuery(notice.title, query) ||
          matchesQuery(notice.description, query) ||
          matchesQuery(notice.admin_name, query)
      ),
    [notices, query]
  );

  const filteredResidents = useMemo(
    () =>
      residents.filter(
        (resident) =>
          !query ||
          matchesQuery(resident.name, query) ||
          matchesQuery(resident.email, query) ||
          matchesQuery(resident.phone, query) ||
          matchesQuery(resident.address, query) ||
          matchesQuery(resident.houseNo, query)
      ),
    [residents, query]
  );

  const filteredDustbins = useMemo(
    () =>
      dustbins.filter(
        (dustbin) =>
          !query ||
          matchesQuery(dustbin.binId, query) ||
          matchesQuery(dustbin.status, query) ||
          matchesQuery(dustbin.assignedUserName, query) ||
          matchesQuery(dustbin.assignedAddress, query)
      ),
    [dustbins, query]
  );

  const totalResults =
    filteredComplaints.length + filteredNotices.length + filteredResidents.length + filteredDustbins.length;

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Admin Search</p>
          <h1>Search management records</h1>
          <p className="page-description">
            {query ? `Results for "${query}".` : "Search complaints, notices, residents, and dustbins."}
          </p>
        </div>
      </section>

      <div className="grid-4">
        <div className="search-stat-card">
          <span>Total Results</span>
          <strong>{totalResults}</strong>
        </div>
        <div className="search-stat-card">
          <span>Complaints</span>
          <strong>{filteredComplaints.length}</strong>
        </div>
        <div className="search-stat-card">
          <span>Residents</span>
          <strong>{filteredResidents.length}</strong>
        </div>
        <div className="search-stat-card">
          <span>Notices & Dustbins</span>
          <strong>{filteredNotices.length + filteredDustbins.length}</strong>
        </div>
      </div>

      {status.loading ? <p>Loading search data...</p> : null}
      {status.error ? <p className="status-message status-error">{status.error}</p> : null}

      {!status.loading && !status.error ? (
        <div className="search-results-layout">
          <SectionCard title="Complaint Results" subtitle="Matches">
              <div className="search-result-grid">
              {filteredComplaints.map((complaint) => (
                <Link key={complaint.complaint_id} className="search-result-card" to={`/admin/complaints/${complaint.complaint_id}`}>
                  <span className="search-result-kicker">Complaint</span>
                  <strong>{complaint.category}</strong>
                  <p>{complaint.name} - {complaint.message}</p>
                  <small>Status: {complaint.status}</small>
                </Link>
              ))}
              {filteredComplaints.length === 0 ? <p className="muted-text">No complaint results.</p> : null}
              </div>
          </SectionCard>

          <SectionCard title="Resident Results" subtitle="Matches">
            <div className="search-result-grid">
              {filteredResidents.map((resident) => (
                <Link key={resident.id} className="search-result-card" to="/admin/residents">
                  <span className="search-result-kicker">Resident</span>
                  <strong>{resident.name}</strong>
                  <p>{resident.address} - {resident.houseNo}</p>
                  <small>{resident.email}</small>
                </Link>
              ))}
              {filteredResidents.length === 0 ? <p className="muted-text">No resident results.</p> : null}
            </div>
          </SectionCard>

          <SectionCard title="Notice Results" subtitle="Matches">
            <div className="search-result-grid">
              {filteredNotices.map((notice) => (
                <Link key={notice.notice_id} className="search-result-card" to="/admin/notices">
                  <span className="search-result-kicker">Notice</span>
                  <strong>{notice.title}</strong>
                  <p>{notice.description}</p>
                  <small>By {notice.admin_name} - {notice.target_zone || "All Zones"}</small>
                </Link>
              ))}
              {filteredNotices.length === 0 ? <p className="muted-text">No notice results.</p> : null}
            </div>
          </SectionCard>

          <SectionCard title="Dustbin Results" subtitle="Matches">
            <div className="search-result-grid">
              {filteredDustbins.map((dustbin) => (
                <Link key={dustbin.binId} className="search-result-card" to="/admin/garbage-monitoring">
                  <span className="search-result-kicker">Dustbin</span>
                  <strong>Dustbin {dustbin.binId}</strong>
                  <p>{dustbin.assignedUserName ?? "Unassigned"} - {dustbin.assignedAddress ?? "-"}</p>
                  <small>Status: {getGarbageDisplayState(dustbin, dustbin.status).statusLabel}</small>
                </Link>
              ))}
              {filteredDustbins.length === 0 ? <p className="muted-text">No dustbin results.</p> : null}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

export default AdminSearchPage;

