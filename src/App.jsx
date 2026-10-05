import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import OverviewPage from './pages/OverviewPage';
import MonitoringPage from './pages/MonitoringPage';
import SecurityPage from './pages/SecurityPage';
import DevicesPage from './pages/DevicesPage';
import { checkBackend } from './api';

export default function App() {
  const [backendConnected, setBackendConnected] = useState(false);

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

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
        <Navbar backendConnected={backendConnected} />
        <main className="flex-1 pt-14 px-3 sm:px-5 pb-8 max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/" element={<OverviewPage backendConnected={backendConnected} />} />
            <Route path="/monitoring" element={<MonitoringPage backendConnected={backendConnected} />} />
            <Route path="/security" element={<SecurityPage backendConnected={backendConnected} />} />
            <Route path="/devices" element={<DevicesPage backendConnected={backendConnected} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
