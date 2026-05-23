/*
 * Project note: Forgot Password Page handles password recovery and reset flow.
 * Keep token validation and user feedback explicit so account recovery feels safe and understandable.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  requestAdminPasswordReset,
  requestResidentPasswordReset
} from "../services/authApi";

function ForgotPasswordPage({ audience = "resident" }) {
  const isAdmin = audience === "admin";
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState({
    loading: false,
    success: "",
    error: ""
  });

  const loginPath = isAdmin ? "/admin/login" : "/resident/login";
  const title = isAdmin ? "Committee password recovery" : "Resident password recovery";
  const helperText = isAdmin
    ? "Enter the committee username, email, or phone number used for the account."
    : "Enter the resident email or phone number linked to the account.";
  const label = isAdmin ? "Username, email, or phone number" : "Registered email or phone number";
  const placeholder = isAdmin ? "committee@smarttole.gov or 98XXXXXXXX" : "resident@email.com or 98XXXXXXXX";

  async function handleSubmit(event) {
    event.preventDefault();

    setStatus({
      loading: true,
      success: "",
      error: ""
    });

    try {
      const response = isAdmin
        ? await requestAdminPasswordReset({ username: identifier })
        : await requestResidentPasswordReset({ email: identifier });

      setStatus({
        loading: false,
        success: response.message || "Recovery link sent successfully.",
        error: ""
      });
    } catch (error) {
      setStatus({
        loading: false,
        success: "",
        error: error.message
      });
    }
  }

  return (
    <div className={`auth-shell ${isAdmin ? "auth-shell-admin" : "auth-shell-resident"}`}>
      <div className="auth-card auth-card-form auth-card-admin-form">
        <div className="auth-top-links">
          <Link to={loginPath}>Back to Sign In</Link>
          <a href="/#features">Features</a>
        </div>

        <div className="auth-header">
          <h2>{title}</h2>
          <p className="helper-text">{helperText}</p>
        </div>

        <form className="form auth-form" onSubmit={handleSubmit}>
          <label>
            {label}
            <input
              type="text"
              value={identifier}
              placeholder={placeholder}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </label>

          {status.success ? <p className="status-message status-success">{status.success}</p> : null}
          {status.error ? <p className="status-message status-error">{status.error}</p> : null}

          <button type="submit" className="button auth-submit-button" disabled={status.loading}>
            {status.loading ? "Sending Link..." : "Send Reset Link"}
          </button>
        </form>
      </div>

      <div className={`auth-card auth-card-feature auth-card-visual ${isAdmin ? "auth-card-admin-visual" : "auth-card-resident-visual"}`}>
        <div className="auth-visual-copy">
          <span className="eyebrow">Recovery</span>
          <h3>{isAdmin ? "Reset committee access" : "Reset resident access"}</h3>
          <p className="helper-text helper-text-light">
            Weâ€™ll email a secure link so you can choose a new password.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
