/*
 * Project note: Complaint Form Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ImageLightbox from "../../components/ImageLightbox";
import SectionCard from "../../components/SectionCard";
import { ALL_COMPLAINT_CATEGORY_OPTIONS, SERVICE_MODULES, SPECIAL_OTHER_CATEGORY_VALUES } from "../../data/serviceModules";
import { createComplaint } from "../../services/complaintApi";
import { getAuthUser } from "../../utils/authStorage";

const SERVICE_SUBJECT_SUGGESTIONS = {
  streetlight: "Streetlight not working",
  water: "Water supply issue",
  drainage: "Drainage or road issue",
  garbage: "Garbage collection issue",
  safety: "Public safety concern"
};

function getModuleById(moduleId) {
  return SERVICE_MODULES.find((module) => module.id === moduleId) || null;
}

function getFirstCategoryValue(module) {
  return module?.categoryOptions?.[0]?.value || module?.categories?.[0] || "";
}

function getOtherCategoryValue(module) {
  return module?.categoryOptions?.find((option) => option.label === "Other")?.value || "Other";
}

function normalizeCategoryForModule(category, module) {
  if (!module) {
    return SPECIAL_OTHER_CATEGORY_VALUES.has(category) ? "Other" : category;
  }

  if (module.categories.includes(category)) {
    return category;
  }

  if (category === "Other") {
    return getOtherCategoryValue(module);
  }

  return getFirstCategoryValue(module);
}

function ComplaintFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const authUser = getAuthUser();
  const [lightboxImage, setLightboxImage] = useState({ src: "", alt: "" });
  const [formData, setFormData] = useState({
    serviceModuleId: "",
    category: "",
    priority: "Medium",
    subject: "",
    message: "",
    photoData: ""
  });
  const [status, setStatus] = useState({
    loading: false,
    error: "",
    success: ""
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const moduleId = params.get("module");
    const matchedModule = SERVICE_MODULES.find((module) => module.id === moduleId);

    if (!matchedModule) {
      return;
    }

    setFormData((current) => ({
      ...current,
      serviceModuleId: matchedModule.id,
      category: normalizeCategoryForModule(current.category, matchedModule) || getFirstCategoryValue(matchedModule),
      subject: current.subject || SERVICE_SUBJECT_SUGGESTIONS[matchedModule.id] || current.subject
    }));
  }, [location.search]);

  function handleChange(event) {
    const { name, value } = event.target;

    if (name === "serviceModuleId") {
      setFormData((current) => ({
        ...current,
        serviceModuleId: value,
        category: ""
      }));
      return;
    }

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

    if (!formData.category) {
      setStatus({
        loading: false,
        error: "Please select a complaint category.",
        success: ""
      });
      return;
    }

    setStatus({
      loading: true,
      error: "",
      success: ""
    });

    try {
      const combinedMessage = formData.subject
        ? `${formData.subject}: ${formData.message}`
        : formData.message;

      const response = await createComplaint({
        userId: authUser?.id,
        serviceModuleId: formData.serviceModuleId,
        category: formData.category,
        priority: formData.priority,
        message: combinedMessage,
        photoData: formData.photoData || null
      });

      setStatus({
        loading: false,
        error: "",
        success: response.message
      });

      setFormData({
        serviceModuleId: "",
        category: "",
        priority: "Medium",
        subject: "",
        message: "",
        photoData: ""
      });

      setTimeout(() => {
        navigate("/resident/complaints");
      }, 700);
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message,
        success: ""
      });
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
          <p className="page-kicker">Resident Service Desk</p>
          <h1>Submit a new complaint</h1>
          <p className="page-description">Report a local issue.</p>
        </div>
      </section>

      <SectionCard title="Complaint Details" subtitle="Add category, message, and photo">
        <form className="form" onSubmit={handleSubmit}>
          <div className="stack-sm">
            <label>Choose Service Module</label>
            <div className="service-module-grid">
              {SERVICE_MODULES.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  className={`service-module-card ${formData.serviceModuleId === module.id ? "service-module-card-active" : ""}`}
                  onClick={() => {
                    setFormData((current) => {
                      if (current.serviceModuleId === module.id) {
                        return {
                          ...current,
                          serviceModuleId: "",
                          category: normalizeCategoryForModule(current.category, null)
                        };
                      }

                      return {
                        ...current,
                        serviceModuleId: module.id,
                        category: normalizeCategoryForModule(current.category, module),
                        subject: current.subject || SERVICE_SUBJECT_SUGGESTIONS[module.id] || ""
                      };
                    });
                  }}
                >
                  <span className="material-symbols-outlined">{module.icon}</span>
                  <strong>{module.title}</strong>
                  <p>{module.description}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <label>
              Category
              <select name="category" value={formData.category} onChange={handleChange}>
                <option value="" disabled>Select Category</option>
                {(getModuleById(formData.serviceModuleId)?.categoryOptions || ALL_COMPLAINT_CATEGORY_OPTIONS).map((categoryOption) => (
                  <option key={categoryOption.value} value={categoryOption.value}>{categoryOption.label}</option>
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
          <div className="form-grid">
            <label>
              Subject
              <input
                name="subject"
                type="text"
                placeholder="Short complaint title"
                value={formData.subject}
                onChange={handleChange}
              />
            </label>
          </div>
          <label>
            Message
            <textarea
              name="message"
              rows="6"
              placeholder="Describe the issue, location, and urgency"
              value={formData.message}
              onChange={handleChange}
            ></textarea>
          </label>
          <label>
            Photo Evidence
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
            <button type="submit" className="button" disabled={status.loading}>
              {status.loading ? "Submitting..." : "Submit Complaint"}
            </button>
            <button type="button" className="button button-secondary" onClick={() => navigate("/resident/complaints")}>
              View Complaint History
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Service Areas" subtitle="Available services">
        <div className="service-module-grid">
          {SERVICE_MODULES.map((module) => (
            <article key={module.id} className="service-module-card service-module-card-static">
              <span className="material-symbols-outlined">{module.icon}</span>
              <strong>{module.title}</strong>
              <p>{module.description}</p>
              <small>{Array.from(new Set((module.categoryOptions || []).map((option) => option.label))).join(", ")}</small>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export default ComplaintFormPage;
