/*
 * Project note: Admin Notices Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import ImageLightbox from "../../components/ImageLightbox";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import { createNotice, deleteNotice, getNoticeZones, getNotices, updateNotice } from "../../services/noticeApi";
import { formatNepalDate } from "../../utils/dateTime";
import { isSystemAdministrator } from "../../utils/adminAccess";
import { getAuthUser } from "../../utils/authStorage";

function buildInitialFormData() {
  return {
    title: "",
    description: "",
    photoData: "",
    date: new Date().toISOString().slice(0, 10),
    targetZone: "All Zones"
  };
}

function AdminNoticesPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const authUser = getAuthUser();
  const isSystemAdmin = isSystemAdministrator(authUser);
  const [formData, setFormData] = useState(buildInitialFormData);
  const [editingNoticeId, setEditingNoticeId] = useState(null);
  const [notices, setNotices] = useState([]);
  const [availableZones, setAvailableZones] = useState([]);
  const [lightboxImage, setLightboxImage] = useState({ src: "", alt: "" });
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    success: ""
  });
  const { toast, showSuccess, showError, showInfo, clearToast } = useActionToast();
  const selectedNoticeId = String(searchParams.get("notice") || "").trim();
  const requestedSection = String(searchParams.get("section") || "").trim();
  const requestedAuthorId = String(searchParams.get("authorId") || "").trim();

  function scrollToSection(sectionId, behavior = "smooth") {
    const element = document.getElementById(sectionId);
    if (!element) {
      return;
    }

    const topOffset = 116;
    const targetTop = window.scrollY + element.getBoundingClientRect().top - topOffset;

    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior
    });
  }

  function scrollToNoticeForm() {
    window.requestAnimationFrame(() => {
      scrollToSection("notice-form-section");
    });
  }

  function scrollToPublishedNotices() {
    window.requestAnimationFrame(() => {
      scrollToSection("published-notices-section");
    });
  }

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    if (requestedSection !== "published") {
      return;
    }

    const firstPass = window.setTimeout(() => {
      scrollToPublishedNotices();
    }, 40);
    const secondPass = window.setTimeout(() => {
      scrollToPublishedNotices();
    }, 220);

    return () => {
      window.clearTimeout(firstPass);
      window.clearTimeout(secondPass);
    };
  }, [requestedSection, location.key]);

  useEffect(() => {
    if (!selectedNoticeId || notices.length === 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToSection(`admin-notice-${selectedNoticeId}`);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [notices, selectedNoticeId]);

  const zoneOptions = useMemo(() => {
    const options = new Set(["All Zones", ...availableZones]);
    if (formData.targetZone && !options.has(formData.targetZone)) {
      options.add(formData.targetZone);
    }

    return Array.from(options);
  }, [availableZones, formData.targetZone]);
  const visibleNotices = useMemo(() => {
    if (!requestedAuthorId) {
      return notices;
    }

    return notices.filter((notice) => Number(notice.admin_id) === Number(requestedAuthorId));
  }, [notices, requestedAuthorId]);

  function canManageNotice(notice) {
    if (!notice) {
      return false;
    }

    if (isSystemAdmin) {
      return true;
    }

    return Number(notice.admin_id) === Number(authUser?.id);
  }

  async function loadPageData({ preserveMessages = false } = {}) {
    try {
      const [noticeData, zoneData] = await Promise.all([getNotices(), getNoticeZones()]);
      setNotices(noticeData);
      setAvailableZones(zoneData);
      setStatus((current) => ({
        loading: false,
        error: "",
        success: preserveMessages ? current.success : ""
      }));
    } catch (error) {
      setStatus((current) => ({
        loading: false,
        error: error.message,
        success: preserveMessages ? current.success : ""
      }));
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      setFormData((current) => ({
        ...current,
        photoData: ""
      }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus((current) => ({
        ...current,
        error: "Please choose an image smaller than 5 MB.",
        success: ""
      }));
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setStatus((current) => ({
        ...current,
        error: ""
      }));
      setFormData((current) => ({
        ...current,
        photoData: typeof reader.result === "string" ? reader.result : ""
      }));
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus((current) => ({
      ...current,
      loading: true,
      error: "",
      success: ""
    }));

    try {
      if (editingNoticeId) {
        const response = await updateNotice(editingNoticeId, formData, authUser?.id);
        showSuccess(response.message);
        setStatus((current) => ({
          ...current,
          loading: false,
          success: response.message
        }));
      } else {
        const response = await createNotice({
          adminId: authUser?.id,
          ...formData
        });
        showSuccess(response.message);
        setStatus((current) => ({
          ...current,
          loading: false,
          success: response.message
        }));
      }

      setFormData(buildInitialFormData());
      setEditingNoticeId(null);
      scrollToNoticeForm();
      await loadPageData({ preserveMessages: true });
      scrollToNoticeForm();
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        loading: false,
        error: error.message
      }));
    }
  }

  function handleEdit(notice) {
    if (!canManageNotice(notice)) {
      showInfo("You can only edit notices published by your own account.");
      return;
    }

    setEditingNoticeId(notice.notice_id);
    setFormData({
      title: notice.title,
      description: notice.description,
      photoData: notice.photo_data || "",
      date: new Date(notice.date).toISOString().slice(0, 10),
      targetZone: notice.target_zone || "All Zones"
    });
    scrollToNoticeForm();
  }

  async function handleDelete(noticeId) {
    const notice = notices.find((item) => Number(item.notice_id) === Number(noticeId));
    if (!canManageNotice(notice)) {
      showInfo("You can only delete notices published by your own account.");
      return;
    }

    const confirmed = window.confirm("Delete this notice permanently?");
    if (!confirmed) {
      const cancelMessage = "Notice deletion was canceled.";
      showInfo(cancelMessage);
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
      const response = await deleteNotice(noticeId, authUser?.id);
      showSuccess(response.message);
      setStatus((current) => ({
        ...current,
        success: response.message
      }));
      await loadPageData({ preserveMessages: true });
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    }
  }

  return (
    <div className="stack-lg">
      <ActionToast kind={toast.kind} message={toast.message} onClose={clearToast} />
      <ImageLightbox
        isOpen={Boolean(lightboxImage.src)}
        src={lightboxImage.src}
        alt={lightboxImage.alt}
        onClose={() => setLightboxImage({ src: "", alt: "" })}
      />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Community Communications</p>
          <h1>Notice management</h1>
          <p className="page-description">Create and publish notices.</p>
        </div>
      </section>

      <div id="notice-form-section">
      <SectionCard title={editingNoticeId ? "Edit Notice" : "Create Notice"} subtitle="Add title, content, zone, and date">
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Notice Title
            <input
              name="title"
              type="text"
              placeholder="Enter notice title"
              value={formData.title}
              onChange={handleChange}
            />
          </label>
          <label>
            Notice Content
            <textarea
              name="description"
              rows="4"
              placeholder="Write notice details"
              value={formData.description}
              onChange={handleChange}
            ></textarea>
          </label>
          <label>
            Target Zone
            <select
              name="targetZone"
              value={formData.targetZone}
              onChange={handleChange}
            >
              {zoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notice Photo
            <input
              name="photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
            />
          </label>
          {formData.photoData ? (
            <button
              type="button"
              className="notice-photo-preview"
              onClick={() => setLightboxImage({ src: formData.photoData, alt: formData.title || "Notice preview" })}
            >
              <img src={formData.photoData} alt="Notice preview" />
              <span>Click to view full image</span>
            </button>
          ) : null}
          <label>
            Notice Date
            <input
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
            />
          </label>
          {status.error ? <p className="status-message status-error">{status.error}</p> : null}
          {status.success ? <p className="status-message status-success">{status.success}</p> : null}
          <div className="button-row">
            <button type="submit" className="button" disabled={status.loading}>
              {status.loading ? "Saving..." : editingNoticeId ? "Update Notice" : "Publish Notice"}
            </button>
            {editingNoticeId ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={status.loading}
                onClick={() => {
                  setEditingNoticeId(null);
                  setFormData(buildInitialFormData());
                  const cancelMessage = "Notice editing was canceled.";
                  showInfo(cancelMessage);
                  setStatus((current) => ({
                    ...current,
                    error: "",
                    success: cancelMessage
                  }));
                }}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>
      </div>

      <div id="published-notices-section">
      <SectionCard title="Published Notices" subtitle="Current notices">
        <div className="stack-sm">
          {status.loading ? <p>Loading notices...</p> : null}
          {visibleNotices.map((notice) => (
            <article
              id={`admin-notice-${notice.notice_id}`}
              key={notice.notice_id}
              className={`list-item notice-card ${String(notice.notice_id) === selectedNoticeId ? "notice-card-active" : ""}`}
            >
              <div className="notice-meta-row">
                <span className="pill pill-info">Published</span>
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
              <small>Audience: {notice.target_zone || "All Zones"}</small>
              <small>Published by {notice.admin_name}</small>
              {canManageNotice(notice) ? (
                <div className="button-row mt-lg">
                  <button type="button" className="button button-secondary" onClick={() => handleEdit(notice)}>
                    Edit
                  </button>
                  <button type="button" className="button button-danger" onClick={() => handleDelete(notice.notice_id)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!status.loading && visibleNotices.length === 0 ? <p className="muted-text">No notices found.</p> : null}
        </div>
      </SectionCard>
      </div>
    </div>
  );
}

export default AdminNoticesPage;
