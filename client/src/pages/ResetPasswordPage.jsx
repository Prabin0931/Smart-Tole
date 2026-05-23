/*
 * Project note: Reset Password Page handles password recovery and reset flow.
 * Keep token validation and user feedback explicit so account recovery feels safe and understandable.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { completePasswordReset, verifyPasswordResetToken } from "../services/authApi";

function ResetPasswordPage({ audience = "resident" }) {
  const isAdmin = audience === "admin";
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: ""
  });
  const [verification, setVerification] = useState({
    loading: true,
    valid: false,
    error: ""
  });
  const [status, setStatus] = useState({
    loading: false,
    success: "",
    error: ""
  });

  const loginPath = isAdmin ? "/admin/login" : "/resident/login";

  useEffect(() => {
    let isMounted = true;

    async function verifyToken() {
      if (!token) {
        if (isMounted) {
          setVerification({
            loading: false,
            valid: false,
            error: "This password reset link is missing or incomplete."
          });
        }
        return;
      }

      try {
        await verifyPasswordResetToken({
          token,
          role: audience
        });

        if (isMounted) {
          setVerification({
            loading: false,
            valid: true,
            error: ""
          });
        }
      } catch (error) {
        if (isMounted) {
          setVerification({
            loading: false,
            valid: false,
            error: error.message
          });
        }
      }
    }

    verifyToken();

    return () => {
      isMounted = false;
    };
  }, [audience, token]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (formData.newPassword.length < 6) {
      setStatus({
        loading: false,
        success: "",
        error: "New password must be at least 6 characters long."
      });
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setStatus({
        loading: false,
        success: "",
        error: "New password and confirm password do not match."
      });
      return;
    }

    setStatus({
      loading: true,
      success: "",
      error: ""
    });

    try {
      const response = await completePasswordReset({
        token,
        role: audience,
        newPassword: formData.newPassword
      });

      setStatus({
        loading: false,
        success: response.message || "Password reset successfully.",
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
          <h2>{isAdmin ? "Set new committee password" : "Set new resident password"}</h2>
          <p className="helper-text">Choose a new password to recover access.</p>
        </div>

        {verification.loading ? <p className="status-message">Checking reset link...</p> : null}
        {verification.error ? <p className="status-message status-error">{verification.error}</p> : null}

        {verification.valid ? (
          <form className="form auth-form" onSubmit={handleSubmit}>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                placeholder="Enter new password"
                value={formData.newPassword}
                onChange={handleChange}
              />
            </label>
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                placeholder="Re-enter new password"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
            </label>

            {status.success ? <p className="status-message status-success">{status.success}</p> : null}
            {status.error ? <p className="status-message status-error">{status.error}</p> : null}

            <button type="submit" className="button auth-submit-button" disabled={status.loading}>
              {status.loading ? "Saving Password..." : "Save New Password"}
            </button>

            {status.success ? (
              <Link className="button button-secondary auth-secondary-button" to={loginPath}>
                Return to Sign In
              </Link>
            ) : null}
          </form>
        ) : null}
      </div>

      <div className={`auth-card auth-card-feature auth-card-visual ${isAdmin ? "auth-card-admin-visual" : "auth-card-resident-visual"}`}>
        <div className="auth-visual-copy">
          <span className="eyebrow">Security</span>
          <h3>Choose a fresh password</h3>
          <p className="helper-text helper-text-light">
            Use a password you have not used before for this account.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
