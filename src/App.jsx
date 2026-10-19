import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import OverviewPage from './pages/OverviewPage';
import MonitoringPage from './pages/MonitoringPage';
import SecurityPage from './pages/SecurityPage';
import DevicesPage from './pages/DevicesPage';
import RoleSetupPage, { AgentSetupPage, ServerSetupPage } from './pages/RoleSetupPage';
import { clearStoredRole, getStoredRole } from './roleStorage';
import { checkBackend } from './api';

export default function App() {
  const [backendConnected, setBackendConnected] = useState(false);
  const [role, setRole] = useState(() => getStoredRole());

  useEffect(() => {
    let active = true;

    const ping = async () => {
      const res = await checkBackend();
      if (active) {
        setBackendConnected(res.connected);
      }
    };

    ping();
    const interval = setInterval(ping, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const syncRole = () => setRole(getStoredRole());
    window.addEventListener('netshield-role-change', syncRole);
    return () => window.removeEventListener('netshield-role-change', syncRole);
  }, []);

  const changeRole = () => {
    clearStoredRole();
    setRole(null);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
        <Navbar backendConnected={backendConnected} onChangeRole={changeRole} />
        <main className="flex-1 pt-14 px-3 sm:px-5 pb-8 max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/setup" element={<RoleSetupPage />} />
            <Route path="/server-setup" element={<ServerSetupPage backendConnected={backendConnected} />} />
            <Route path="/agent-setup" element={<AgentSetupPage backendConnected={backendConnected} />} />
            <Route path="/" element={role ? <OverviewPage backendConnected={backendConnected} /> : <Navigate to="/setup" replace />} />
            <Route path="/monitoring" element={role ? <MonitoringPage backendConnected={backendConnected} /> : <Navigate to="/setup" replace />} />
            <Route path="/security" element={role ? <SecurityPage backendConnected={backendConnected} /> : <Navigate to="/setup" replace />} />
            <Route path="/devices" element={role ? <DevicesPage backendConnected={backendConnected} /> : <Navigate to="/setup" replace />} />
            <Route path="*" element={<Navigate to={role ? '/' : '/setup'} replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
