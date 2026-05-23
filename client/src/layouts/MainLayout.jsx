/*
 * Project note: Main Layout defines shared page chrome for one portal area.
 * Navigation, account context, and common spacing belong here so feature pages stay focused.
 */
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuthUser, getAuthUser } from "../utils/authStorage";
import NotificationCenter from "../components/NotificationCenter";

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const authUser = getAuthUser();
  const isResident = authUser?.role === "resident";
  const [isHomeNavVisible, setIsHomeNavVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const avatarLabel = useMemo(() => {
    const name = authUser?.fullName ?? authUser?.name ?? authUser?.username ?? "Resident";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [authUser?.fullName, authUser?.name, authUser?.username]);

  useEffect(() => {
    if (isResident) {
      return undefined;
    }

    let lastScrollY = window.scrollY;

    function handleScroll() {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 16) {
        setIsHomeNavVisible(true);
      } else if (currentScrollY < lastScrollY) {
        setIsHomeNavVisible(true);
      } else if (currentScrollY > lastScrollY) {
        setIsHomeNavVisible(false);
      }

      lastScrollY = currentScrollY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isResident]);

  useEffect(() => {
    if (!isResident) {
      return;
    }

    const params = new URLSearchParams(location.search);
    setSearchQuery(params.get("q") ?? "");
  }, [isResident, location.search]);

  function handleLogout() {
    clearAuthUser();
    navigate("/");
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      navigate("/resident/search");
      return;
    }

    navigate(`/resident/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  if (isResident) {
    return (
      <div className="resident-shell">
        <aside className="shell-sidebar">
          <NavLink to="/resident/dashboard" className="shell-brand shell-brand-link">
            <div className="shell-brand-icon">
              <span className="material-symbols-outlined">assured_workload</span>
            </div>
            <div>
              <div className="shell-brand-title">Smart Tole</div>
              <div className="shell-brand-subtitle">Resident Portal</div>
            </div>
          </NavLink>

          <nav className="shell-nav">
            <NavLink to="/resident/dashboard" className="shell-link">
              <span className="material-symbols-outlined">dashboard</span>
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/resident/notices" className="shell-link">
              <span className="material-symbols-outlined">campaign</span>
              <span>Notices</span>
            </NavLink>
            <NavLink to="/resident/complaints" className="shell-link">
              <span className="material-symbols-outlined">emergency_home</span>
              <span>Complaints</span>
            </NavLink>
            <NavLink to="/resident/complaints/new" className="shell-link">
              <span className="material-symbols-outlined">add_circle</span>
              <span>New Complaint</span>
            </NavLink>
            <NavLink to="/resident/garbage-status" className="shell-link">
              <span className="material-symbols-outlined">delete_sweep</span>
              <span>Garbage Status</span>
            </NavLink>
          </nav>

          <div className="shell-support">
            <p>Support 24/7</p>
            <h3>Need help with your community services?</h3>
            <button type="button" className="button button-secondary shell-support-button" onClick={() => navigate("/resident/contact-admin")}>
              Contact Admin
            </button>
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
                placeholder="Search notices, complaints, or updates..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
          </form>
          <div className="shell-topbar-actions">
              <NotificationCenter authUser={authUser} />
              <NavLink to="/resident/profile" className="shell-user shell-user-link">
                <div className="shell-user-copy">
                  <strong>{authUser?.fullName ?? "Resident"}</strong>
                  <small>{authUser?.email ?? "Community Member"}</small>
                </div>
                <div className="shell-user-avatar" aria-hidden="true">{avatarLabel}</div>
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

  return (
    <div className="app-shell">
      <header className={`topbar topbar-home ${isHomeNavVisible ? "topbar-home-visible" : "topbar-home-hidden"}`}>
        <div className="brand-block-home">
          <NavLink to="/">Smart Tole</NavLink>
        </div>
        <nav className="topnav topnav-home">
          <NavLink to="/">Home</NavLink>
          <a href="/#features">Features</a>
          <a href="/#about">About</a>
          <NavLink to="/resident/login">Resident Portal</NavLink>
          <NavLink to="/admin/login" className="nav-cta">Admin Portal</NavLink>
        </nav>
      </header>

      <main className="page-wrap page-frame">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
