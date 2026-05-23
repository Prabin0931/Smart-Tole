/*
 * Project note: Protected Route is a reusable interface component used across Smart Tole.
 * Keep this component focused on display behavior so page-specific business rules stay in the page or service layer.
 */
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAuthUser } from "../utils/authStorage";
import { isSystemAdministrator } from "../utils/adminAccess";

function ProtectedRoute({ allowedRole, systemAdminOnly = false, fallbackPath = "/admin/dashboard", children }) {
  const authUser = getAuthUser();
  const location = useLocation();

  if (!authUser) {
    const loginPath = allowedRole === "admin" ? "/admin/login" : "/resident/login";
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (allowedRole && authUser.role !== allowedRole) {
    const fallbackPath = authUser.role === "admin" ? "/admin/dashboard" : "/resident/dashboard";
    return <Navigate to={fallbackPath} replace />;
  }

  if (allowedRole === "admin" && systemAdminOnly && !isSystemAdministrator(authUser)) {
    return <Navigate to={fallbackPath} replace state={{ from: location.pathname }} />;
  }

  if (children) {
    return children;
  }

  return <Outlet />;
}

export default ProtectedRoute;
