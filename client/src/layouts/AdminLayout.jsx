/*
 * Project note: Admin Layout defines shared page chrome for one portal area.
 * Navigation, account context, and common spacing belong here so feature pages stay focused.
 */
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuthUser, getAuthUser } from "../utils/authStorage";
import NotificationCenter from "../components/NotificationCenter";
import { getRoleLabel } from "../data/committeeRoles";
import { getDefaultAdminComplaintsPath } from "../utils/adminAccess";

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const authUser = getAuthUser();
  const [searchQuery, setSearchQuery] = useState("");
  const complaintsPath = getDefaultAdminComplaintsPath(authUser);

  const avatarLabel = useMemo(() => {
    const name = authUser?.name ?? authUser?.username ?? "Admin";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [authUser?.name, authUser?.username]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchQuery(params.get("q") ?? "");
  }, [location.search]);

  function handleLogout() {
    clearAuthUser();
    navigate("/admin/login");
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      navigate("/admin/search");
      return;
    }

    navigate(`/admin/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <div className="resident-shell">
      <aside className="shell-sidebar shell-sidebar-admin">
        <NavLink to="/admin/dashboard" className="shell-brand shell-brand-link">
          <div className="shell-brand-icon">
            <span className="material-symbols-outlined">shield_person</span>
          </div>
          <div>
            <div className="shell-brand-title">Smart Tole</div>
            <div className="shell-brand-subtitle">Management Portal</div>
          </div>
        </NavLink>

        <nav className="shell-nav">
          <NavLink to="/admin/dashboard" className="shell-link">
            <span className="material-symbols-outlined">dashboard</span>
            <span>Dashboard</span>
          </NavLink>
          <NavLink to={complaintsPath} className="shell-link">
            <span className="material-symbols-outlined">campaign</span>
            <span>Complaints</span>
          </NavLink>
          <NavLink to="/admin/notices" className="shell-link">
            <span className="material-symbols-outlined">news</span>
            <span>Notices</span>
          </NavLink>
          <NavLink to="/admin/committees" className="shell-link">
            <span className="material-symbols-outlined">groups</span>
            <span>Committees</span>
          </NavLink>
          <NavLink to="/admin/reports" className="shell-link">
            <span className="material-symbols-outlined">monitoring</span>
            <span>Reports</span>
          </NavLink>
          <NavLink to="/admin/residents" className="shell-link">
            <span className="material-symbols-outlined">group</span>
            <span>Residents</span>
          </NavLink>
          <NavLink to="/admin/garbage-monitoring" className="shell-link">
            <span className="material-symbols-outlined">delete_sweep</span>
            <span>Garbage Monitoring</span>
          </NavLink>
        </nav>

        <div className="shell-support shell-support-admin">
          <p>Operations Hub</p>
          <h3>Oversee complaints, notices, and community service flow.</h3>
          <button type="button" className="button shell-support-button shell-logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="shell-main">
        <header className="shell-topbar">
          <form className="shell-search" onSubmit={handleSearchSubmit}>
            <span className="material-symbols-outlined">search</span>
            <input
              type="text"
              placeholder="Search residents, notices, complaints, or dustbins..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </form>
          <div className="shell-topbar-actions">
            <NotificationCenter authUser={authUser} />
            <NavLink to="/admin/profile" className="shell-user shell-user-link">
              <div className="shell-user-copy">
                <strong>{authUser?.name ?? authUser?.username ?? "Admin"}</strong>
                <small>{getRoleLabel(authUser?.roleType) || authUser?.username || "Administrator"}</small>
              </div>
              <div className="shell-user-avatar shell-user-avatar-admin" aria-hidden="true">{avatarLabel}</div>
            </NavLink>
          </div>
        </header>

        <section className="shell-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

export default AdminLayout;
