/*
 * Project note: Admin Login Page handles account sign-in for its portal.
 * Use simple labels and clear recovery paths because this is the first point of support for users.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginAdmin } from "../services/authApi";
import { saveAuthUser } from "../utils/authStorage";

function AdminLoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: "",
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
      const response = await loginAdmin(formData);
      saveAuthUser(response.user);
      navigate("/admin/dashboard");
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message
      });
    }
  }

  return (
    <div className="auth-shell auth-shell-admin">
      <div className="auth-card auth-card-feature auth-card-admin-visual">
        <div className="auth-brand auth-brand-light">
          <div className="auth-brand-icon">
            <span className="material-symbols-outlined">assured_workload</span>
          </div>
          <div>
            <strong>Smart Tole</strong>
            <span>Admin Portal</span>
          </div>
        </div>

        <div className="auth-visual-copy auth-admin-copy">
          <h3>Manage community work from one place.</h3>
          <p className="helper-text helper-text-light">
            Complaints, notices, residents, committees, and dustbins in one portal.
          </p>
        </div>

        <div className="auth-metrics">
          <div>
            <strong>5</strong>
            <span>Service Areas</span>
          </div>
          <div>
            <strong>Live</strong>
            <span>Bin Monitoring</span>
          </div>
        </div>
      </div>

      <div className="auth-card auth-card-form auth-card-admin-form">
        <div className="auth-header">
          <div className="auth-top-links">
            <a href="/#features">Features</a>
            <a href="/#about">About</a>
          </div>
          <h2>Admin and committee sign in</h2>
          <p className="helper-text">Sign in to manage daily work.</p>
        </div>

        <div className="auth-inline-note">
          <span className="brand-chip">Default Sign-In Help</span>
          <p className="helper-text">
            Default admin: <strong>reactadmin</strong> / <strong>admin123</strong>
            <br />
            Backup admin: <strong>backupadmin</strong> / <strong>backup123</strong>
          </p>
        </div>

        <form className="form auth-form" onSubmit={handleSubmit}>
          <label>
            Email/Username
            <input
              name="username"
              type="text"
              placeholder="Enter your email or username"
              value={formData.username}
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
            <Link className="auth-text-link" to="/admin/forgot-password">
              Forgot password?
            </Link>
          </div>
          {status.error ? <p className="status-message status-error">{status.error}</p> : null}
          <button type="submit" className="button auth-submit-button" disabled={status.loading}>
            {status.loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-divider"></div>

        <div className="auth-support-card">
          <span className="material-symbols-outlined">help</span>
          <div>
            <strong>Lost access or locked out?</strong>
            <p>Use password recovery first, or contact your system administrator if the account has no recovery email.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLoginPage;
