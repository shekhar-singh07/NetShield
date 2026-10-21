import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStatus } from '../api';
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
        <h2 className="mt-6 text-lg font-semibold text-on-surface">How would you like to use this computer?</h2>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <RoleCard
          icon="dns"
          title="Run as Server"
          description="Central monitoring, analysis, and agent hub."
          features={['Live traffic + ML detection', 'Connected agent management']}
          action="Set Up Server"
          onClick={() => chooseRole('server')}
        />
        <RoleCard
          icon="laptop_mac"
          title="Run as Agent"
          description="Send traffic data to a server on your LAN."
          features={['Heartbeat to server', 'Connection health view']}
          action="Connect to Server"
          onClick={() => chooseRole('agent')}
        />
      </div>
    </div>
  );
}

function StatusBanner({ tone, text, next }) {
  return (
    <div className={`mb-5 flex items-start gap-2.5 rounded-lg border p-3.5 ${tone}`}>
      <span className="material-symbols-outlined text-[20px] leading-none mt-0.5">info</span>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[13px] font-semibold">{text}</span>
        <span className="font-mono text-[12px] opacity-90">{next}</span>
      </div>
    </div>
  );
}

const TONE = {
  green: 'bg-secondary/10 border-secondary/30 text-secondary',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  red: 'bg-error-container/20 border-error/30 text-error',
};

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

  const banner = !backendConnected
    ? { tone: TONE.red, text: 'Backend unreachable.', next: 'Next: start the FastAPI service.' }
    : !message
    ? { tone: TONE.amber, text: 'Checking services…', next: 'Next: wait for the result.' }
    : message.includes('unreachable')
    ? { tone: TONE.red, text: 'Backend unreachable.', next: 'Next: start the FastAPI service.' }
    : status?.tcp_server?.running
    ? { tone: TONE.green, text: 'TCP listener running.', next: 'Next: open the dashboard.' }
    : { tone: TONE.amber, text: 'TCP listener not running.', next: 'Next: check backend logs, retry.' };

  return (
    <SetupShell title="Set up your NetShield server" onBack={() => navigate('/setup')}>
      <StatusBanner {...banner} />
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoTile label="Reachable LAN address" value={status?.ip || (backendConnected ? 'Detecting…' : 'Backend unavailable')} />
        <InfoTile label="Agent TCP port" value={status?.tcp_server?.port || 5000} />
        <InfoTile label="TCP listener" value={status?.tcp_server?.running ? 'Running' : 'Not running'} />
        <InfoTile label="API port" value={status?.api_server?.port || 8000} />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={checkServer} disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:cursor-wait disabled:opacity-60">
          {loading ? 'Checking services…' : 'Check Services'}
        </button>
      </div>
    </SetupShell>
  );
}

export function AgentSetupPage({ backendConnected }) {
  const navigate = useNavigate();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5000');
  const [copied, setCopied] = useState(false);
  const command = `python agent/traffic_generator.py --server ${host.trim() || '<SERVER_IP>'} --port ${port || 5000}`;

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const banner = !backendConnected
    ? { tone: TONE.red, text: 'Local backend offline.', next: 'Next: start the FastAPI service.' }
    : { tone: TONE.amber, text: 'Agent not connected.', next: 'Next: run the command on the agent computer.' };

  return (
    <SetupShell title="Connect this computer as an agent" onBack={() => navigate('/setup')}>
      <StatusBanner {...banner} />
      <p className="text-sm leading-6 text-on-surface-variant">
        The agent runs on the other computer — launch it with the command below.
      </p>
      <div className="mt-5 space-y-4">
        <label className="block text-sm text-on-surface">
          Server IP address or hostname
          <input required value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.50 or nids-host" pattern="[A-Za-z0-9][A-Za-z0-9.-]*" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface outline-none focus:border-primary" />
        </label>
        <label className="block text-sm text-on-surface">
          TCP port
          <input required type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface outline-none focus:border-primary" />
        </label>
        <div>
          <div className="mb-2 text-xs uppercase tracking-wider text-outline">Run on the agent computer</div>
          <code className="block overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-xs text-primary">{command}</code>
        </div>
        <button type="button" onClick={copyCommand} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
          {copied ? 'Copied' : 'Copy command'}
        </button>
      </div>
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
