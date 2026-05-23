/*
 * Project note: Complaint Edit Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ImageLightbox from "../../components/ImageLightbox";
import SectionCard from "../../components/SectionCard";
import { ALL_COMPLAINT_CATEGORIES } from "../../data/serviceModules";
import { updateResidentComplaint, getResidentComplaintById } from "../../services/complaintApi";
import { getAuthUser } from "../../utils/authStorage";

function ComplaintEditPage() {
  const navigate = useNavigate();
  const { complaintId } = useParams();
  const authUser = getAuthUser();
  const [lightboxImage, setLightboxImage] = useState({ src: "", alt: "" });
  const [formData, setFormData] = useState({
    category: "",
    priority: "Medium",
    message: "",
    photoData: ""
  });
  const [status, setStatus] = useState({
    loading: true,
    saving: false,
    error: "",
    success: ""
  });

  useEffect(() => {
    async function loadComplaint() {
      try {
        const complaint = await getResidentComplaintById(authUser?.id, complaintId);
        setFormData({
          category: complaint.category || "",
          priority: complaint.priority || "Medium",
          message: complaint.message || "",
          photoData: complaint.photo_data || ""
        });
        setStatus({
          loading: false,
          saving: false,
          error: "",
          success: ""
        });
      } catch (error) {
        setStatus({
          loading: false,
          saving: false,
          error: error.message,
          success: ""
        });
      }
    }

    loadComplaint();
  }, [authUser?.id, complaintId]);

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

    if (!formData.category || !formData.message) {
      setStatus((current) => ({
        ...current,
        error: "Category and message are required."
      }));
      return;
    }

    setStatus((current) => ({
      ...current,
      saving: true,
      error: "",
      success: ""
    }));

    try {
      const response = await updateResidentComplaint(authUser?.id, complaintId, {
        category: formData.category,
        priority: formData.priority,
        message: formData.message,
        photoData: formData.photoData || null
      });

      setStatus((current) => ({
        ...current,
        saving: false,
        success: response.message
      }));

      setTimeout(() => {
        navigate(`/resident/complaints/${complaintId}`);
      }, 600);
    } catch (error) {
      setStatus((current) => ({
        ...current,
        saving: false,
        error: error.message
      }));
    }
  }

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
          <p className="page-kicker">Issue Tracking</p>
          <h1>Edit complaint</h1>
          <p className="page-description">Update this complaint.</p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" to={`/resident/complaints/${complaintId}`}>Back To Details</Link>
        </div>
      </section>

      <SectionCard title="Edit Complaint" subtitle="Edit details and photo">
        {status.loading ? <p>Loading complaint...</p> : null}
        {!status.loading ? (
          <form className="form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Category
                <select name="category" value={formData.category} onChange={handleChange}>
                  <option value="" disabled>Select Category</option>
                  {ALL_COMPLAINT_CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" value={formData.priority} onChange={handleChange}>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </label>
            </div>
            <label>
              Message
              <textarea
                name="message"
                rows="6"
                value={formData.message}
                onChange={handleChange}
              ></textarea>
            </label>
            <label>
              Photo Evidence
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>
            {formData.photoData ? (
              <button
                type="button"
                className="complaint-photo-preview complaint-photo-preview-button"
                onClick={() => setLightboxImage({ src: formData.photoData, alt: "Complaint preview" })}
              >
                <img src={formData.photoData} alt="Complaint preview" />
                <span className="complaint-photo-hint">Click to view full image</span>
              </button>
            ) : null}
            {status.error ? <p className="status-message status-error">{status.error}</p> : null}
            {status.success ? <p className="status-message status-success">{status.success}</p> : null}
            <div className="button-row">
              <button type="submit" className="button" disabled={status.saving}>
                {status.saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default ComplaintEditPage;
