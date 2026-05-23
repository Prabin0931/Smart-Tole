/*
 * Project note: This is the navigation map for Smart Tole.
 * Keep route protection and page ownership here so each role enters only the screens meant for it.
 */
import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import AdminLayout from "./layouts/AdminLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import HomeRedirect from "./components/HomeRedirect";
import ResidentLoginPage from "./pages/ResidentLoginPage";
import ResidentRegisterPage from "./pages/ResidentRegisterPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ResidentDashboardPage from "./pages/resident/ResidentDashboardPage";
import NoticesPage from "./pages/resident/NoticesPage";
import ComplaintFormPage from "./pages/resident/ComplaintFormPage";
import ComplaintHistoryPage from "./pages/resident/ComplaintHistoryPage";
import ComplaintDetailPage from "./pages/resident/ComplaintDetailPage";
import ComplaintEditPage from "./pages/resident/ComplaintEditPage";
import ContactAdminPage from "./pages/resident/ContactAdminPage";
import GarbageStatusPage from "./pages/resident/GarbageStatusPage";
import ResidentSearchPage from "./pages/resident/ResidentSearchPage";
import ResidentProfilePage from "./pages/resident/ResidentProfilePage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminComplaintsPage from "./pages/admin/AdminComplaintsPage";
import AdminComplaintDetailPage from "./pages/admin/AdminComplaintDetailPage";
import AdminNoticesPage from "./pages/admin/AdminNoticesPage";
import AdminReportsPage from "./pages/admin/AdminReportsPage";
import AdminCommitteeActivityPage from "./pages/admin/AdminCommitteeActivityPage";
import AdminCommitteePage from "./pages/admin/AdminCommitteePage";
import ResidentsPage from "./pages/admin/ResidentsPage";
import EditResidentPage from "./pages/admin/EditResidentPage";
import GarbageMonitoringPage from "./pages/admin/GarbageMonitoringPage";
import AdminDustbinDetailPage from "./pages/admin/AdminDustbinDetailPage";
import AdminSearchPage from "./pages/admin/AdminSearchPage";
import AdminProfilePage from "./pages/admin/AdminProfilePage";

function App() {
  return (
    <Routes>
      {/* Public pages: visible before login and shared by both resident/admin users. */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/resident/login" element={<ResidentLoginPage />} />
        <Route path="/resident/register" element={<ResidentRegisterPage />} />
        <Route path="/resident/forgot-password" element={<ForgotPasswordPage audience="resident" />} />
        <Route path="/resident/reset-password" element={<ResetPasswordPage audience="resident" />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/forgot-password" element={<ForgotPasswordPage audience="admin" />} />
        <Route path="/admin/reset-password" element={<ResetPasswordPage audience="admin" />} />
      </Route>

      {/* Resident-only workspace: ProtectedRoute blocks admin or unauthenticated access. */}
      <Route element={<ProtectedRoute allowedRole="resident" />}>
        <Route element={<MainLayout />}>
          <Route path="/resident/dashboard" element={<ResidentDashboardPage />} />
          <Route path="/resident/notices" element={<NoticesPage />} />
          <Route path="/resident/complaints/new" element={<ComplaintFormPage />} />
          <Route path="/resident/complaints" element={<ComplaintHistoryPage />} />
          <Route path="/resident/complaints/:complaintId" element={<ComplaintDetailPage />} />
          <Route path="/resident/complaints/:complaintId/edit" element={<ComplaintEditPage />} />
          <Route path="/resident/contact-admin" element={<ContactAdminPage />} />
          <Route path="/resident/garbage-status" element={<GarbageStatusPage />} />
          <Route path="/resident/search" element={<ResidentSearchPage />} />
          <Route path="/resident/profile" element={<ResidentProfilePage />} />
        </Route>
      </Route>

      {/* Admin/committee workspace: role checks inside pages decide which actions are visible. */}
      <Route path="/admin" element={<ProtectedRoute allowedRole="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="complaints" element={<AdminComplaintsPage />} />
          <Route path="complaints/:complaintId" element={<AdminComplaintDetailPage />} />
          <Route path="notices" element={<AdminNoticesPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route
            path="reports/committee/:committeeId"
            element={
              /* Only system administrators can open individual committee activity reports. */
              <ProtectedRoute allowedRole="admin" systemAdminOnly fallbackPath="/admin/reports">
                <AdminCommitteeActivityPage />
              </ProtectedRoute>
            }
          />
          <Route path="committees" element={<AdminCommitteePage />} />
          <Route path="residents" element={<ResidentsPage />} />
          <Route
            path="residents/:residentId/edit"
            element={
              /* Resident editing/deactivation is reserved for full system administrators. */
              <ProtectedRoute allowedRole="admin" systemAdminOnly fallbackPath="/admin/residents">
                <EditResidentPage />
              </ProtectedRoute>
            }
          />
          <Route path="garbage-monitoring" element={<GarbageMonitoringPage />} />
          <Route path="garbage-monitoring/:binId" element={<AdminDustbinDetailPage />} />
          <Route path="search" element={<AdminSearchPage />} />
          <Route path="profile" element={<AdminProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
