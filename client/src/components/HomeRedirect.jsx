/*
 * Project note: Home Redirect is a reusable interface component used across Smart Tole.
 * Keep this component focused on display behavior so page-specific business rules stay in the page or service layer.
 */
import { Navigate } from "react-router-dom";
import HomePage from "../pages/HomePage";
import { getAuthUser } from "../utils/authStorage";

function HomeRedirect() {
  const authUser = getAuthUser();

  if (authUser?.role === "resident") {
    return <Navigate to="/resident/dashboard" replace />;
  }

  if (authUser?.role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <HomePage />;
}

export default HomeRedirect;
