/*
 * Project note: Resident Register Page is a top-level page in the public or portal experience.
 * Keep the page copy short, practical, and connected to the backend service that owns the real data.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerResident } from "../services/authApi";
import { saveAuthUser } from "../utils/authStorage";

function ResidentRegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    houseNo: "",
    zone: "",
    password: ""
  });
  const [status, setStatus] = useState({
    loading: false,
    error: "",
    success: ""
  });

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({
      loading: true,
      error: "",
      success: ""
    });

    try {
      const response = await registerResident(formData);
      saveAuthUser(response.user);
      setStatus({
        loading: false,
        error: "",
        success: response.message
      });
      navigate("/resident/dashboard");
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message,
        success: ""
      });
    }
  }

  return (
    <div className="auth-shell auth-shell-register">
      <div className="auth-card auth-card-feature auth-card-register-visual">
        <div className="auth-brand auth-brand-light">
          <div className="auth-brand-icon">
            <span className="material-symbols-outlined">assured_workload</span>
          </div>
          <div>
            <strong>Smart Tole</strong>
            <span>Resident Portal</span>
          </div>
        </div>

        <div className="auth-visual-copy auth-register-copy">
          <h3>Join your digital community.</h3>
          <p className="helper-text helper-text-light">
            Access local services, report issues instantly, and stay connected with your neighbors through the Smart Tole platform.
          </p>
        </div>

        <div className="auth-feature-list">
          <div className="auth-feature-item">
            <div className="auth-feature-icon">
              <span className="material-symbols-outlined">verified_user</span>
            </div>
            <div>
              <strong>Secure Verification</strong>
              <p>Your data is encrypted and managed with municipal-grade standards.</p>
            </div>
          </div>
          <div className="auth-feature-item">
            <div className="auth-feature-icon">
              <span className="material-symbols-outlined">home_pin</span>
            </div>
            <div>
              <strong>Address Precision</strong>
              <p>Link your identity to your household for accurate service delivery.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-card auth-card-form auth-card-register-form">
        <div className="auth-header">
          <h2>Resident registration</h2>
          <p className="helper-text">
            Complete your profile to unlock notices, complaint workflows, and digital community services.
          </p>
        </div>

        <form className="form auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-section">
            <div className="auth-section-title">
              <span className="material-symbols-outlined">person</span>
              Personal Details
            </div>
            <div className="form-grid">
              <label>
                Full name
                <input
                  name="fullName"
                  type="text"
                  placeholder="Johnathan Doe"
                  value={formData.fullName}
                  onChange={handleChange}
                />
              </label>
              <label>
                Contact number
                <input
                  name="phone"
                  type="text"
                  placeholder="+977 98XXXXXXXX"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </label>
            </div>
          </div>

          <div className="auth-form-section">
            <div className="auth-section-title">
              <span className="material-symbols-outlined">home</span>
              Residential Address
            </div>
            <div className="form-grid">
              <label>
                Street address / block
                <input
                  name="address"
                  type="text"
                  placeholder="Maplewood Avenue, Block B"
                  value={formData.address}
                  onChange={handleChange}
                />
              </label>
              <label>
                House number
                <input
                  name="houseNo"
                  type="text"
                  placeholder="H-204"
                  value={formData.houseNo}
                  onChange={handleChange}
                />
              </label>
              <label>
                Zone / Area
                <input
                  name="zone"
                  type="text"
                  placeholder="Ward 4, East Block"
                  value={formData.zone}
                  onChange={handleChange}
                />
              </label>
            </div>
          </div>

          <div className="auth-form-section">
            <div className="auth-section-title">
              <span className="material-symbols-outlined">lock</span>
              Resident Access
            </div>
            <div className="form-grid">
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  placeholder="resident@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </label>
              <label>
                Security password
                <input
                  name="password"
                  type="password"
                  placeholder="Create a secure password"
                  value={formData.password}
                  onChange={handleChange}
                />
              </label>
            </div>
          </div>

          {status.error ? <p className="status-message status-error">{status.error}</p> : null}
          {status.success ? <p className="status-message status-success">{status.success}</p> : null}

          <div className="auth-form-footer">
            <p className="helper-text">Already have a resident account? <Link to="/resident/login">Login here</Link></p>
            <button type="submit" className="button auth-submit-button" disabled={status.loading}>
              {status.loading ? "Creating account..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ResidentRegisterPage;
