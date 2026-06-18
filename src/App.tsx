import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { useThemeStore } from "./store/themeStore";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import UserManagement from "./pages/UserManagement";
import { Toaster } from "react-hot-toast";
import CodingRound from "./pages/CodingRound";
import MCQRound from "./pages/MCQRound";
import ViewScores from "./pages/ViewScores";
import CommunicationRound from "./pages/CommunicationRound";
import QuestionBank from "./pages/QuestionBank";
import Takecomm from "./pages/Takecomm";
import AdminMonitor from "./pages/AdminMonitor";
import ListeningRound from "./pages/ListeningRound";
import AddingMCQs from "./pages/AddingMCQs";  
function App() {
  const { user, loading, userRole } = useAuthStore();
  const { theme } = useThemeStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate("/login");
      }
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route
          path="/login"
          element={!user ? <Login /> : <Navigate to="/" />}
        />
        <Route path="/" element={user ? <Layout /> : <Navigate to="/login" />}>
          {/* HR-only routes */}
          {userRole === 'hr' && (
            <>
              <Route index element={<Dashboard />} />
              <Route path="ViewScores" element={<ViewScores />} />
              <Route path="questions" element={<QuestionBank />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="CommunicationRound" element={<CommunicationRound/>}/>
              <Route path="settings" element={<Settings />} />
              <Route path="AddingMCQs" element={<AddingMCQs />} />
            </>
          )}
          
          {/* Routes accessible to both HR and regular users */}
          <Route path="MCQRound" element={<MCQRound />} />
          <Route path="Takecomm" element={<Takecomm />} />
          <Route path="CodingRound" element={<CodingRound />} />
          <Route path="AdminMonitor" element={<AdminMonitor />} />
          <Route path="ListeningRound" element={<ListeningRound />} />
          
          {/* Redirect regular users to MCQ Round if they try to access HR-only routes */}
          {userRole === 'user' && (
            <>
              <Route path="*" element={<Navigate to="/MCQRound" />} />
            </>
          )}
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}

export default App;
