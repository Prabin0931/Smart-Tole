/*
 * Project note: Resident Login Page handles account sign-in for its portal.
 * Use simple labels and clear recovery paths because this is the first point of support for users.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginResident } from "../services/authApi";
import { saveAuthUser } from "../utils/authStorage";

function ResidentLoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({
    loading: false,
    error: ""
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
      error: ""
    });

    try {
      const response = await loginResident(formData);
      saveAuthUser(response.user);
      navigate("/resident/dashboard");
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message
      });
    }
  }

  return (
    <div className="auth-shell auth-shell-resident">
      <div className="auth-card auth-card-form auth-card-resident-form">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <span className="material-symbols-outlined">assured_workload</span>
          </div>
          <div>
            <strong>Smart Tole</strong>
            <span>Resident Portal</span>
          </div>
        </div>

        <div className="auth-top-links">
          <a href="/#features">Features</a>
          <a href="/#about">About</a>
        </div>

        <div className="auth-header">
          <h2>Resident sign in</h2>
          <p className="helper-text">
            Read notices, send complaints, and check updates.
          </p>
        </div>

        <form className="form auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              name="email"
              type="text"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
            />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
              />
              <button
                type="button"
                className="password-toggle-button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <div className="auth-inline-actions">
            <Link className="auth-text-link" to="/resident/forgot-password">
              Forgot password?
            </Link>
          </div>
          {status.error ? <p className="status-message status-error">{status.error}</p> : null}
          <button type="submit" className="button auth-submit-button" disabled={status.loading}>
            {status.loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-divider"></div>

        <div className="auth-inline-note">
          <p>New resident?</p>
          <Link className="button button-secondary auth-secondary-button" to="/resident/register">
            Resident Registration
          </Link>
        </div>
      </div>

      <div className="auth-card auth-card-feature auth-card-visual auth-card-resident-visual">
        <div className="auth-visual-badge">
          <span className="material-symbols-outlined">verified_user</span>
          Safe Resident Access
        </div>

        <div className="auth-visual-copy">
          <span className="eyebrow">Resident Services</span>
          <h3>Smart Tole Resident Portal</h3>
          <p className="helper-text helper-text-light">
            Notices, complaints, messages, and dustbin updates in one place.
          </p>
        </div>

        <div className="auth-testimonial">
          <div className="auth-testimonial-header">
            <div className="auth-avatar">
              <span className="material-symbols-outlined">person</span>
            </div>
            <div>
              <strong>Resident Tools</strong>
              <span>Daily community access</span>
            </div>
          </div>
          <p>
            Read notices, report issues, and follow updates from one dashboard.
          </p>
          <div className="auth-dots">
            <span className="active"></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResidentLoginPage;
