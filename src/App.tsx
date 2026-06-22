import { useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { useThemeStore } from "./store/themeStore";
import { Toaster } from "react-hot-toast";

// Pages & Components
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import UserManagement from "./pages/UserManagement";
import CodingRound from "./pages/CodingRound";
import MCQRound from "./pages/MCQRound";
import ViewScores from "./pages/ViewScores";
import CommunicationRound from "./pages/CommunicationRound";
import QuestionBank from "./pages/QuestionBank";
import Takecomm from "./pages/Takecomm";
import AdminMonitor from "./pages/AdminMonitor";
import ListeningRound from "./pages/ListeningRound";
import AddingMCQs from "./pages/AddingMCQs";  
import ChatPage from "./pages/ChatPage";

function App() {
  const { user, loading, userRole } = useAuthStore();
  const { theme } = useThemeStore();

  // Handle Theme switching
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Helper helper to dynamically resolve landing spot based on user role
  const getRedirectPath = () => userRole === "hr" ? "/dashboard" : "/MCQRound";

  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        {/* PUBLIC ROUTE: Login */}
        <Route
          path="/login"
          element={!user ? <Login /> : <Navigate to={getRedirectPath()} replace />}
        />

        {/* PROTECTED ROUTES (Requires Authentication) */}
        <Route element={user ? <Outlet /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Layout />}>
            
            {/* Root index path sends them to their respective dashboard */}
            <Route index element={<Navigate to={getRedirectPath()} replace />} />

            {/* HR ONLY ROUTES */}
            <Route element={userRole === "hr" ? <Outlet /> : <Navigate to="/MCQRound" replace />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="ViewScores" element={<ViewScores />} />
              <Route path="questions" element={<QuestionBank />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="CommunicationRound" element={<CommunicationRound />} />
              <Route path="settings" element={<Settings />} />
              <Route path="AddingMCQs" element={<AddingMCQs />} />
              <Route path="AdminMonitor" element={<AdminMonitor />} />
            </Route>

            {/* CANDIDATE / SHARED PROTECTED ROUTES */}
            <Route path="MCQRound" element={<MCQRound />} />
            <Route path="Takecomm" element={<Takecomm />} />
            <Route path="CodingRound" element={<CodingRound />} />
            <Route path="ListeningRound" element={<ListeningRound />} />
            <Route path="chat" element={<ChatPage />} />

          </Route>
        </Route>

        {/* GLOBAL CATCH-ALL: Redirects unauthenticated to login, authenticated to home base */}
        <Route path="*" element={<Navigate to={user ? getRedirectPath() : "/login"} replace />} />
      </Routes>
    </>
  );
}

export default App;
