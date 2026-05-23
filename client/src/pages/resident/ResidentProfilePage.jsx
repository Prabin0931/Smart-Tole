/*
 * Project note: Resident Profile Page supports the resident portal workflow.
 * Keep data scoped to the logged-in resident so personal complaints, notices, profile details, and bins stay private.
 */
import { useEffect, useState } from "react";
import SectionCard from "../../components/SectionCard";
import { saveAuthUser, getAuthUser } from "../../utils/authStorage";
import {
  changeResidentPassword,
  getResidentProfile,
  updateResidentProfile
} from "../../services/profileApi";

function ResidentProfilePage() {
  const authUser = getAuthUser();
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    houseNo: ""
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

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getResidentProfile(authUser?.id);
        setProfile({
          fullName: data.fullName || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          houseNo: data.houseNo || ""
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
      const response = await updateResidentProfile(authUser?.id, {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        address: profile.address
      });
      saveAuthUser({
        ...authUser,
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        houseNo: profile.houseNo
      });
      setStatus((current) => ({
        ...current,
        success: response.message
      }));
    } catch (error) {
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
      const response = await changeResidentPassword(authUser?.id, passwordData);
      setPasswordData({
        currentPassword: "",
        newPassword: ""
      });
      setStatus((current) => ({
        ...current,
        success: response.message
      }));
    } catch (error) {
      setStatus((current) => ({
        ...current,
        error: error.message
      }));
    }
  }

  return (
    <div className="stack-lg">
      <section className="page-intro">
        <div>
          <p className="page-kicker">Resident Profile</p>
          <h1>My profile settings</h1>
          <p className="page-description">View your account and password.</p>
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
                  <input name="fullName" type="text" value={profile.fullName} onChange={handleProfileChange} />
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
                  House Number
                  <input
                    name="houseNo"
                    type="text"
                    value={profile.houseNo}
                    readOnly
                    aria-readonly="true"
                    title="Only admin can update house number"
                  />
                </label>
              </div>
              <p className="form-helper">House number is managed by admin and cannot be changed here.</p>
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

export default ResidentProfilePage;
