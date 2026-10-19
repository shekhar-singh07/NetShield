import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectAgent, fetchStatus } from '../api';
import { setStoredRole } from '../roleStorage';

function RoleCard({ icon, title, description, features, action, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-surface-container-low border border-outline-variant rounded-xl p-5 sm:p-6 transition-all hover:-translate-y-1 hover:border-primary/60 hover:bg-surface-container hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="material-symbols-outlined text-primary text-[32px]">{icon}</span>
      <h2 className="mt-4 text-xl font-semibold text-on-surface">{title}</h2>
      <p className="mt-2 min-h-16 text-sm leading-6 text-on-surface-variant">{description}</p>
      <ul className="mt-5 space-y-2 text-sm text-on-surface-variant">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="material-symbols-outlined text-secondary text-[17px]">check_circle</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <span className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors group-hover:bg-primary/80">
        {action}
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </span>
    </button>
  );
}

export default function RoleSetupPage() {
  const navigate = useNavigate();

  const chooseRole = (role) => {
    setStoredRole(role);
    navigate(role === 'server' ? '/server-setup' : '/agent-setup');
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl flex-col justify-center py-8">
      <div className="mb-8 text-center">
        <span className="material-symbols-outlined text-primary text-[42px]">security</span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">Welcome to NetShield</h1>
        <p className="mx-auto mt-3 max-w-xl text-on-surface-variant">
          Secure your network with intelligent monitoring and threat detection.
        </p>
        <h2 className="mt-8 text-lg font-semibold text-on-surface">How would you like to use this computer?</h2>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <RoleCard
          icon="dns"
          title="Run as Server"
          description="Manage your network security from this computer. Receive agent connections, analyze network traffic, detect suspicious activity, and monitor security events."
          features={['Centralized security monitoring', 'Network traffic analysis and ML-based detection', 'Connected agent management', 'Security events and dashboard analytics']}
          action="Set Up Server"
          onClick={() => chooseRole('server')}
        />
        <RoleCard
          icon="laptop_mac"
          title="Run as Agent"
          description="Connect this computer to an existing NetShield server and participate in network monitoring."
          features={['Connect to a NetShield server', 'Send agent heartbeat messages', 'View connection health', 'Participate in the supported traffic-monitoring workflow']}
          action="Connect to Server"
          onClick={() => chooseRole('agent')}
        />
      </div>
    </div>
  );
}

export function ServerSetupPage({ backendConnected }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const checkServer = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await fetchStatus();
      setStatus(result);
      setMessage(result.tcp_server?.running ? 'Server services are running and ready for agents.' : 'The TCP listener is not running.');
    } catch {
      setMessage('The backend is unreachable. Start the FastAPI service, then try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!backendConnected) return undefined;
    const timer = window.setTimeout(checkServer, 0);
    return () => window.clearTimeout(timer);
  }, [backendConnected]);

  return (
    <SetupShell title="Set up your NetShield server" onBack={() => navigate('/setup')}>
      <p className="text-sm leading-6 text-on-surface-variant">
        The server receives agent heartbeats and runs the monitoring, flow analysis, and detection pipeline.
        FastAPI serves the dashboard API on port {status?.api_server?.port || 8000}.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <InfoTile label="Reachable LAN address" value={status?.ip || (backendConnected ? 'Detecting…' : 'Backend unavailable')} />
        <InfoTile label="Agent TCP port" value={status?.tcp_server?.port || 5000} />
        <InfoTile label="TCP listener" value={status?.tcp_server?.running ? 'Running' : 'Not running'} />
        <InfoTile label="Packet capture" value={status?.packet_capture?.running ? 'Running' : 'Not running'} />
      </div>
      {message && <p className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={checkServer} disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:cursor-wait disabled:opacity-60">
          {loading ? 'Checking services…' : 'Start Server'}
        </button>
        <button type="button" onClick={() => navigate('/')} className="rounded-lg border border-outline-variant px-4 py-2 text-sm text-on-surface-variant hover:border-primary/50 hover:text-on-surface">
          Open Dashboard
        </button>
      </div>
      <p className="mt-5 text-xs text-outline">
        The FastAPI process starts the TCP listener as part of its lifecycle. This action verifies the actual service health; it does not spawn unrestricted local processes.
      </p>
    </SetupShell>
  );
}

export function AgentSetupPage({ backendConnected }) {
  const navigate = useNavigate();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5000');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await connectAgent(host.trim(), Number(port));
      setResult(response.success ? { ok: true, text: response.message } : { ok: false, text: response.error });
    } catch (error) {
      setResult({ ok: false, text: error.message || 'Connection request failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupShell title="Connect this computer as an agent" onBack={() => navigate('/setup')}>
      <p className="text-sm leading-6 text-on-surface-variant">
        Enter the server address on your LAN. NetShield will use the existing HELLO/HELLO_ACK handshake and 3-second heartbeat protocol.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm text-on-surface">
          Server IP address or hostname
          <input required value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.50 or nids-host" pattern="[A-Za-z0-9][A-Za-z0-9.-]*" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface outline-none focus:border-primary" />
        </label>
        <label className="block text-sm text-on-surface">
          TCP port
          <input required type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface outline-none focus:border-primary" />
        </label>
        {!backendConnected && <p className="text-sm text-error">The local backend is unavailable. Start it before connecting this agent.</p>}
        {result && <p className={`rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-error/30 bg-error-container/20 text-error'}`}>{result.text}</p>}
        <button type="submit" disabled={busy || !backendConnected} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? 'Connecting…' : 'Connect Agent'}
        </button>
      </form>
      {result?.ok && <button type="button" onClick={() => navigate('/devices')} className="mt-4 text-sm text-primary hover:underline">View connection health →</button>}
    </SetupShell>
  );
}

function SetupShell({ title, onBack, children }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <button type="button" onClick={onBack} className="mb-6 flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span> Change role
      </button>
      <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5 shadow-xl sm:p-7">
        <h1 className="text-2xl font-bold text-on-surface">{title}</h1>
        {children}
      </section>
    </div>
  );
}

function InfoTile({ label, value }) {
  return <div className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest p-3"><div className="font-mono text-[10px] uppercase tracking-wider text-outline">{label}</div><div className="mt-1 text-sm font-semibold text-on-surface">{value}</div></div>;
}
