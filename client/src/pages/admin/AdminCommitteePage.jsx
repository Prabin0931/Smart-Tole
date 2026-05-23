/*
 * Project note: Admin Committee Page supports the admin and committee-user operation workflow.
 * Keep permission-sensitive actions clear here because admins and role-based committee users may share this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ActionToast from "../../components/ActionToast";
import useActionToast from "../../hooks/useActionToast";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { ASSIGNABLE_ROLE_OPTIONS, getRoleDescription, getRoleLabel } from "../../data/committeeRoles";
import { getResidents } from "../../services/residentApi";
import { getAuthUser } from "../../utils/authStorage";
import { canManageCommitteeUsers } from "../../utils/adminAccess";
import {
  createCommitteeAdmin,
  deleteCommitteeAdmin,
  getCommitteeAdmins,
  updateCommitteeAdmin
} from "../../services/adminApi";

const DEFAULT_ROLE_TYPE = ASSIGNABLE_ROLE_OPTIONS[0]?.value || "Streetlight Committee";

const DEFAULT_FORM = {
  residentId: "",
  name: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  roleType: DEFAULT_ROLE_TYPE,
  accountStatus: "Active"
};

function createSuggestedUsername(name, email, residentId = "") {
  const emailPrefix = String(email || "")
    .split("@")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (emailPrefix) {
    return emailPrefix;
  }

  const baseName = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (baseName) {
    return `${baseName}${residentId ? residentId : ""}`.slice(0, 24);
  }

  return "";
}

function AdminCommitteePage() {
  const authUser = getAuthUser();
  const location = useLocation();
  const [committeeUsers, setCommitteeUsers] = useState([]);
  const [residents, setResidents] = useState([]);
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState({
    loading: true,
    error: "",
    success: ""
  });
  const { toast, showSuccess, showError, showInfo, clearToast } = useActionToast();

  useEffect(() => {
    loadCommitteeUsers();
  }, []);

  const canManageCommitteeAccounts = canManageCommitteeUsers(authUser);
  const showCreateCommitteeForm = canManageCommitteeAccounts;

  useEffect(() => {
    if (status.loading) {
      return;
    }

    const section = new URLSearchParams(location.search).get("section");
    if (section !== "users" && section !== "roles") {
      return;
    }

    const targetId = section === "users" ? "committee-users-section" : "role-overview-section";
    scrollToSection(targetId);
  }, [location.search, status.loading]);

  function scrollToSection(sectionId) {
    const sectionElement = document.getElementById(sectionId);
    if (!sectionElement) {
      return;
    }

    const topOffset = 116;
    const sectionTop = window.scrollY + sectionElement.getBoundingClientRect().top - topOffset;

    window.scrollTo({
      top: Math.max(sectionTop, 0),
      behavior: "smooth"
    });
  }

  async function loadCommitteeUsers({ preserveMessages = false } = {}) {
    try {
      const [committeeData, residentData] = await Promise.all([getCommitteeAdmins(), getResidents()]);
      setCommitteeUsers(committeeData);
      setResidents(residentData);
      setStatus((current) => ({
        loading: false,
        error: preserveMessages ? current.error : "",
        success: preserveMessages ? current.success : ""
      }));
    } catch (error) {
      setStatus({
        loading: false,
        error: error.message,
        success: ""
      });
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleResidentAssignmentChange(event) {
    const residentId = event.target.value;
    const selectedResident = residents.find(
      (resident) => String(resident.id || resident.userId) === String(residentId)
    );

    setFormData((current) => {
      if (!selectedResident) {
        return {
          ...current,
          residentId: ""
        };
      }

      const selectedName = selectedResident.fullName || selectedResident.name || "";
      const selectedEmail = selectedResident.email || "";
      const selectedPhone = selectedResident.phone || "";
      const suggestedUsername =
        !current.username || current.username === createSuggestedUsername(current.name, current.email, current.residentId)
          ? createSuggestedUsername(selectedName, selectedEmail, selectedResident.id || selectedResident.userId)
          : current.username;

      return {
        ...current,
        residentId,
        name: selectedName,
        email: selectedEmail,
        phone: selectedPhone,
        username: suggestedUsername
      };
    });
  }

  function resetForm() {
    setEditingAdminId(null);
    setFormData(DEFAULT_FORM);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus((current) => ({
      ...current,
      loading: true,
      error: "",
      success: ""
    }));

    try {
      const payload = {
        name: formData.name,
        username: formData.username,
        email: formData.email,
        phone: formData.phone,
        roleType: formData.roleType,
        accountStatus: formData.accountStatus,
        password: formData.password
      };

      const response = editingAdminId
        ? await updateCommitteeAdmin(editingAdminId, payload)
        : await createCommitteeAdmin(payload);

      showSuccess(response.message);
      setStatus({
        loading: false,
        error: "",
        success: response.message
      });
      resetForm();
      await loadCommitteeUsers({ preserveMessages: true });
    } catch (error) {
      showError(error.message);
      setStatus({
        loading: false,
        error: error.message,
        success: ""
      });
    }
  }

  function handleEdit(user) {
    setEditingAdminId(user.id);
    setFormData({
      residentId: "",
      name: user.name,
      username: user.username,
      email: user.email || "",
      phone: user.phone || "",
      password: "",
      roleType: user.roleType,
      accountStatus: user.accountStatus || "Active"
    });
    setStatus((current) => ({
      ...current,
      error: "",
      success: ""
    }));
    window.requestAnimationFrame(() => {
      document.getElementById("committee-form-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  async function handleDelete(adminId) {
    const confirmed = window.confirm("Delete this committee user permanently?");
    if (!confirmed) {
      const cancelMessage = "Committee user deletion was canceled.";
      showInfo(cancelMessage);
      setStatus((current) => ({
        ...current,
        error: "",
        success: cancelMessage
      }));
      return;
    }

    setStatus((current) => ({
      ...current,
      loading: true,
      error: "",
      success: ""
    }));

    try {
      const response = await deleteCommitteeAdmin(adminId);
      showSuccess(response.message);
      setStatus({
        loading: false,
        error: "",
        success: response.message
      });
      if (editingAdminId === adminId) {
        resetForm();
      }
      await loadCommitteeUsers({ preserveMessages: true });
    } catch (error) {
      showError(error.message);
      setStatus({
        loading: false,
        error: error.message,
        success: ""
      });
    }
  }

  const roles = useMemo(
    () => Array.from(new Set(committeeUsers.map((user) => user.roleType))),
    [committeeUsers]
  );

  return (
    <div className="stack-lg">
      <ActionToast kind={toast.kind} message={toast.message} onClose={clearToast} />
      <section className="page-intro">
        <div>
          <p className="page-kicker">Committee Management</p>
          <h1>Committee directory</h1>
          <p className="page-description">Manage committee accounts and roles.</p>
        </div>
      </section>

      {status.loading ? <p>Loading committee users...</p> : null}

      {!status.loading ? (
        <div className="grid-3">
          <StatCard label="Committee Users" value={committeeUsers.length} onClick={() => scrollToSection("committee-users-section")} />
          <StatCard label="Role Types" value={roles.length} onClick={() => scrollToSection("role-overview-section")} />
          <StatCard label="Main Responsibility" value="Complaint Coordination" to="/admin/complaints?mode=board" />
        </div>
      ) : null}

      {showCreateCommitteeForm ? (
        <div id="committee-form-section">
          <SectionCard
            title={editingAdminId ? "Edit Committee User" : "Create Committee User"}
            subtitle="Create or update accounts"
          >
          <form className="form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Full Name
                <input
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter committee member name"
                />
              </label>
              <label>
                Username
                <input
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Enter login username"
                />
              </label>
              <label>
                Email Address
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="committee@smarttole.gov"
                />
              </label>
              <label>
                Phone Number
                <input
                  name="phone"
                  type="text"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="98XXXXXXXX"
                />
              </label>
              <label>
                Committee Role
                <select
                  name="roleType"
                  value={formData.roleType}
                  onChange={handleChange}
                >
                  {ASSIGNABLE_ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account Status
                {editingAdminId ? (
                  <select
                    name="accountStatus"
                    value={formData.accountStatus}
                    onChange={handleChange}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                ) : (
                  <input
                    name="accountStatus"
                    type="text"
                    value={formData.accountStatus}
                    readOnly
                  />
                )}
              </label>
            </div>
            <label>
              Assign Resident As Committee Member (optional)
              <select
                name="residentId"
                value={formData.residentId}
                onChange={handleResidentAssignmentChange}
              >
                <option value="">Select a resident to auto-fill details</option>
                {residents.map((resident) => (
                  <option key={resident.id || resident.userId} value={resident.id || resident.userId}>
                    {resident.fullName} {resident.houseNo ? `- ${resident.houseNo}` : ""} {resident.zone ? `- ${resident.zone}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted-text">{getRoleDescription(formData.roleType)}</p>
            <label>
              {editingAdminId ? "Reset Password (optional)" : "Password"}
              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder={editingAdminId ? "Leave blank to keep current password" : "Enter secure password"}
              />
            </label>
            {editingAdminId ? (
              <p className="muted-text">
                Current password is hidden. Add a new one to change it.
              </p>
            ) : null}
            {status.error ? <p className="status-message status-error">{status.error}</p> : null}
            {status.success ? <p className="status-message status-success">{status.success}</p> : null}
            <div className="button-row">
              <button type="submit" className="button" disabled={status.loading}>
                {status.loading ? "Saving..." : editingAdminId ? "Update Committee User" : "Create Committee User"}
              </button>
              {editingAdminId ? (
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => handleDelete(editingAdminId)}
                  disabled={status.loading}
                >
                  Delete Committee User
                </button>
              ) : null}
              {editingAdminId ? (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    resetForm();
                    const cancelMessage = "Committee user editing was canceled.";
                    showInfo(cancelMessage);
                    setStatus((current) => ({
                      ...current,
                      error: "",
                      success: cancelMessage
                    }));
                  }}
                  disabled={status.loading}
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>
          </SectionCard>
        </div>
      ) : null}

      <div id="committee-users-section">
        <SectionCard title="Committee Users" subtitle="Current accounts">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SN</th>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Account Status</th>
                  {canManageCommitteeAccounts ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
              {committeeUsers.map((user, index) => (
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td>{user.name}</td>
                  <td>{user.username}</td>
                  <td>{user.email || "-"}</td>
                  <td>{getRoleLabel(user.roleType)}</td>
                  <td>{user.accountStatus || "Active"}</td>
                  {canManageCommitteeAccounts ? (
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="button button-secondary table-action-button"
                          onClick={() => handleEdit(user)}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!committeeUsers.length ? <p className="muted-text">No committee users yet.</p> : null}
        </SectionCard>
      </div>

      <div id="role-overview-section">
        <SectionCard title="Role Types" subtitle="Available roles">
        <div className="stack-sm">
          {ASSIGNABLE_ROLE_OPTIONS.map((role) => (
            <article key={role.value} className="list-item">
              <strong>{role.label}</strong>
              <p className="muted-text">{role.description}</p>
            </article>
          ))}
        </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default AdminCommitteePage;
