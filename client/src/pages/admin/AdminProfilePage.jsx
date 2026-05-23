/*
 * Project note: Admin Profile Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useState } from "react";
import ActionToast from "../../components/ActionToast";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import { getRoleLabel } from "../../data/committeeRoles";
import { getAuthUser, saveAuthUser } from "../../utils/authStorage";
import {
  changeAdminPassword,
  getAdminProfile,
  updateAdminProfile
} from "../../services/profileApi";

function AdminProfilePage() {
  const authUser = getAuthUser();
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    roleType: "",
    phone: "",
    address: ""
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: ""
  });
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    success: ""
  });
  const { toast, showSuccess, showError, clearToast } = useActionToast();

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getAdminProfile(authUser?.id);
        setProfile({
          name: data.name || "",
          email: data.email || "",
          roleType: data.roleType || "Committee Member",
          phone: data.phone || "",
          address: data.address || ""
        });
        setStatus({
          loading: false,
          error: "",
          success: ""
        });
      } catch (error) {
        setStatus({
          loading: false,
          error: error.message,
          success: ""
        });
      }
    }

    loadProfile();
  }, [authUser?.id]);

  function handleProfileChange(event) {
    const { name, value } = event.target;
    setProfile((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handlePasswordChange(event) {
    const { name, value } = event.target;
    setPasswordData((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));

    try {
      const response = await updateAdminProfile(authUser?.id, {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address
      });
      saveAuthUser({
        ...authUser,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address
      });
      showSuccess(response.message);
      setStatus((current) => ({
        ...current,
        success: response.message
      }));
    } catch (error) {
      showError(error.message);
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));

    try {
      const response = await changeAdminPassword(authUser?.id, passwordData);
      setPasswordData({
        currentPassword: "",
        newPassword: ""
      });
      showSuccess(response.message);
      setStatus((current) => ({
        ...current,
        success: response.message
      }));
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
      <section className="page-intro">
        <div>
          <p className="page-kicker">Committee Profile</p>
          <h1>My profile settings</h1>
          <p className="page-description">View your account and password settings.</p>
        </div>
      </section>

      {status.loading ? <p>Loading profile...</p> : null}
      {status.error ? <p className="status-message status-error">{status.error}</p> : null}
      {status.success ? <p className="status-message status-success">{status.success}</p> : null}

      {!status.loading ? (
        <>
          <SectionCard title="Profile Information" subtitle="Account details">
            <form className="form" onSubmit={handleSaveProfile}>
              <div className="form-grid">
                <label>
                  Full Name
                  <input name="name" type="text" value={profile.name} onChange={handleProfileChange} />
                </label>
                <label>
                  Email Address
                  <input name="email" type="email" value={profile.email} onChange={handleProfileChange} />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Mobile Number
                  <input name="phone" type="text" value={profile.phone} onChange={handleProfileChange} />
                </label>
                <label>
                  Home Address
                  <input name="address" type="text" value={profile.address} onChange={handleProfileChange} />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Committee Role / Department
                  <input type="text" value={getRoleLabel(profile.roleType)} readOnly />
                </label>
              </div>
              <div className="button-row">
                <button type="submit" className="button">Save Profile</button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Change Password" subtitle="Password update">
            <form className="form" onSubmit={handleChangePassword}>
              <div className="form-grid">
                <label>
                  Current Password
                  <input name="currentPassword" type="password" value={passwordData.currentPassword} onChange={handlePasswordChange} />
                </label>
                <label>
                  New Password
                  <input name="newPassword" type="password" value={passwordData.newPassword} onChange={handlePasswordChange} />
                </label>
              </div>
              <p className="muted-text">
                Your existing password is stored securely and cannot be shown. Enter your current password to confirm your identity, then set a new one.
              </p>
              <div className="button-row">
                <button type="submit" className="button">Update Password</button>
              </div>
            </form>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

export default AdminProfilePage;
