/*
 * Project note: Contact Admin Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SectionCard from "../../components/SectionCard";
import { getCommitteeAdmins } from "../../services/adminApi";
import { contactAdmin } from "../../services/contactApi";
import { getAuthUser } from "../../utils/authStorage";

function ContactAdminPage() {
  const authUser = getAuthUser();
  const [formData, setFormData] = useState({
    fullName: authUser?.fullName ?? "",
    email: authUser?.email ?? "",
    subject: "",
    message: ""
  });
  const [status, setStatus] = useState({
    success: "",
    error: ""
  });
  const [adminContacts, setAdminContacts] = useState([]);
  const [contactsStatus, setContactsStatus] = useState({
    loading: true,
    error: ""
  });

  useEffect(() => {
    async function loadAdminContacts() {
      try {
        const admins = await getCommitteeAdmins();
        setAdminContacts(
          admins.filter((admin) => String(admin.accountStatus || "Active") === "Active")
        );
        setContactsStatus({
          loading: false,
          error: ""
        });
      } catch (error) {
        setContactsStatus({
          loading: false,
          error: error.message
        });
      }
    }

    loadAdminContacts();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.subject || !formData.message) {
      setStatus({
        success: "",
        error: "Please fill in the subject and message before sending."
      });
      return;
    }

    try {
      const response = await contactAdmin(formData);

      setStatus({
        success: response.message,
        error: ""
      });
    } catch (error) {
      setStatus({
        success: "",
        error: error.message
      });
      return;
    }

    setFormData((current) => ({
      ...current,
      subject: "",
      message: ""
    }));
  }

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Resident Support</p>
          <h1>Contact admin</h1>
          <p className="page-description">Contact the committee for support.</p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" to="/resident/dashboard">Back to Dashboard</Link>
        </div>
      </section>

      <div className="complaint-detail-layout">
        <SectionCard title="Send a Message" subtitle="Send a direct message">
          <form className="form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Full Name
                <input
                  name="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleChange}
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </label>
            </div>
            <label>
              Subject
              <input
                name="subject"
                type="text"
                placeholder="What do you need help with?"
                value={formData.subject}
                onChange={handleChange}
              />
            </label>
            <label>
              Message
              <textarea
                name="message"
                rows="6"
                placeholder="Describe your issue or question"
                value={formData.message}
                onChange={handleChange}
              ></textarea>
            </label>
            {status.error ? <p className="status-message status-error">{status.error}</p> : null}
            {status.success ? <p className="status-message status-success">{status.success}</p> : null}
            <button type="submit" className="button">Send Message</button>
          </form>
        </SectionCard>

        <SectionCard title="Admin Contact Info" subtitle="Support contact">
          {contactsStatus.loading ? <p>Loading admin contacts...</p> : null}
          {contactsStatus.error ? <p className="status-message status-error">{contactsStatus.error}</p> : null}
          {!contactsStatus.loading && !contactsStatus.error ? (
            adminContacts.length > 0 ? (
              <div className="stack-sm">
                {adminContacts.map((admin) => (
                  <div key={admin.id} className="info-box">
                    <span>{admin.roleType}</span>
                    <strong>{admin.name || admin.username}</strong>
                    <p className="muted-text">{admin.phone || "Phone not added"}</p>
                    <p className="muted-text">{admin.email || "Email not added"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-text">No active admin contacts available.</p>
            )
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

export default ContactAdminPage;
