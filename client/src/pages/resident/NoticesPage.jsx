/*
 * Project note: Notices Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ImageLightbox from "../../components/ImageLightbox";
import SectionCard from "../../components/SectionCard";
import { getNotices } from "../../services/noticeApi";
import { formatNepalDate } from "../../utils/dateTime";
import { getAuthUser } from "../../utils/authStorage";

function NoticesPage() {
  const [searchParams] = useSearchParams();
  const authUser = getAuthUser();
  const [notices, setNotices] = useState([]);
  const [lightboxImage, setLightboxImage] = useState({ src: "", alt: "" });
  const [status, setStatus] = useState({
    loading: true,
    error: ""
  });
  const selectedNoticeId = String(searchParams.get("notice") || "").trim();

  useEffect(() => {
    async function loadNotices() {
      try {
        const data = await getNotices(authUser?.zone);
        setNotices(data);
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

    loadNotices();
  }, [authUser?.zone]);

  useEffect(() => {
    if (!selectedNoticeId || notices.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const element = document.getElementById(`resident-notice-${selectedNoticeId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [notices, selectedNoticeId]);

  return (
    <div className="stack-lg">
      <ImageLightbox
        isOpen={Boolean(lightboxImage.src)}
        src={lightboxImage.src}
        alt={lightboxImage.alt}
        onClose={() => setLightboxImage({ src: "", alt: "" })}
      />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Notice Board</p>
          <h1>Community notices and updates</h1>
          <p className="page-description">View notices and updates.</p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" to="/resident/dashboard">Back to Dashboard</Link>
        </div>
      </section>

      <SectionCard
        title="Published Notices"
        subtitle={authUser?.zone ? `Zone: ${authUser.zone}` : "Community notices"}
      >
        {status.loading ? <p>Loading notices...</p> : null}
        {status.error ? <p className="status-message status-error">{status.error}</p> : null}
        {!status.loading ? (
          <div className="notice-grid">
            {notices.map((notice) => (
              <article
                id={`resident-notice-${notice.notice_id}`}
                key={notice.notice_id}
                className={`notice-feature-card ${String(notice.notice_id) === selectedNoticeId ? "notice-feature-card-active" : ""}`}
              >
                <div className="notice-meta-row">
                  <span className="pill pill-info">Official Notice</span>
                  <small>{formatNepalDate(notice.date)}</small>
                </div>
                {notice.photo_data ? (
                  <button
                    type="button"
                    className="notice-card-media notice-card-media-button"
                    onClick={() => setLightboxImage({ src: notice.photo_data, alt: notice.title })}
                  >
                    <img src={notice.photo_data} alt={notice.title} />
                    <span className="notice-card-media-hint">View full image</span>
                  </button>
                ) : null}
                <strong className="item-title">{notice.title}</strong>
                <p>{notice.description}</p>
                <small className="notice-author">Audience: {notice.target_zone || "All Zones"}</small>
                <small className="notice-author">Published by {notice.admin_name}</small>
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default NoticesPage;
