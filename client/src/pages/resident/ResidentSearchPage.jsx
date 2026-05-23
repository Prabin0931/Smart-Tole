/*
 * Project note: Resident Search Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import { getResidentComplaints } from "../../services/complaintApi";
import { getGarbageBins } from "../../services/garbageApi";
import { getNotices } from "../../services/noticeApi";
import { getAuthUser } from "../../utils/authStorage";
import { getGarbageDisplayState } from "../../utils/garbageStatus";

function matchesQuery(value, query) {
  return String(value ?? "").toLowerCase().includes(query);
}

function ResidentSearchPage() {
  const authUser = getAuthUser();
  const location = useLocation();
  const [notices, setNotices] = useState([]);
  const [complaints, setComplaints] = useState([]);
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
      if (!authUser?.id) {
        setStatus({
          loading: false,
          error: "Resident account not found."
        });
        return;
      }

      try {
        const [noticeData, complaintData, dustbinData] = await Promise.all([
          getNotices(authUser?.zone),
          getResidentComplaints(authUser.id),
          getGarbageBins(authUser.id)
        ]);

        setNotices(noticeData);
        setComplaints(complaintData);
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
  }, [authUser?.id, authUser?.zone]);

  const filteredNotices = useMemo(
    () =>
      notices.filter(
        (notice) =>
          !query ||
          matchesQuery(notice.title, query) ||
          matchesQuery(notice.description, query) ||
          matchesQuery(notice.date, query)
      ),
    [notices, query]
  );

  const filteredComplaints = useMemo(
    () =>
      complaints.filter(
        (complaint) =>
          !query ||
          matchesQuery(complaint.category, query) ||
          matchesQuery(complaint.message, query) ||
          matchesQuery(complaint.status, query)
      ),
    [complaints, query]
  );

  const filteredDustbins = useMemo(
    () =>
      dustbins.filter(
        (dustbin) =>
          !query ||
          matchesQuery(dustbin.binId, query) ||
          matchesQuery(dustbin.status, query) ||
          matchesQuery(dustbin.fillPercentage, query)
      ),
    [dustbins, query]
  );

  const totalResults = filteredNotices.length + filteredComplaints.length + filteredDustbins.length;

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Resident Search</p>
          <h1>Search your portal</h1>
          <p className="page-description">
            {query ? `Results for "${query}".` : "Search notices, complaints, and dustbins."}
          </p>
        </div>
      </section>

      <div className="grid-3">
        <div className="search-stat-card">
          <span>Total Results</span>
          <strong>{totalResults}</strong>
        </div>
        <div className="search-stat-card">
          <span>Complaints</span>
          <strong>{filteredComplaints.length}</strong>
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
                <Link key={complaint.complaint_id} className="search-result-card" to={`/resident/complaints/${complaint.complaint_id}`}>
                  <span className="search-result-kicker">Complaint</span>
                  <strong>{complaint.category}</strong>
                  <p>{complaint.message}</p>
                  <small>Status: {complaint.status}</small>
                </Link>
              ))}
              {filteredComplaints.length === 0 ? <p className="muted-text">No complaint results.</p> : null}
            </div>
          </SectionCard>

          <SectionCard title="Notice Results" subtitle="Matches">
            <div className="search-result-grid">
              {filteredNotices.map((notice) => (
                <article key={notice.notice_id} className="search-result-card">
                  <span className="search-result-kicker">Notice</span>
                  <strong>{notice.title}</strong>
                  <p>{notice.description}</p>
                  <small>{notice.date}</small>
                </article>
              ))}
              {filteredNotices.length === 0 ? <p className="muted-text">No notice results.</p> : null}
            </div>
          </SectionCard>

          <SectionCard title="Dustbin Results" subtitle="Matches">
            <div className="search-result-grid">
              {filteredDustbins.map((dustbin) => (
                <Link key={dustbin.binId} className="search-result-card" to="/resident/garbage-status">
                  <span className="search-result-kicker">Dustbin</span>
                  <strong>Dustbin {dustbin.binId}</strong>
                  <p>{getGarbageDisplayState(dustbin, dustbin.status).fillLabel}</p>
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

export default ResidentSearchPage;
