/**
 * NetShield-ML — API Layer
 * Centralized API calls to the FastAPI backend.
 * All data comes from real backend — never fabricated.
 */

function getApiBase() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:8000';
  }

  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }

  // GitHub Codespaces forwards each port through a host such as
  // <codespace>-5173.app.github.dev.
  if (hostname.includes('-5173.')) {
    return `${protocol}//${hostname.replace('-5173.', '-8000.')}`;
  }

  return `${protocol}//${hostname}:8000`;
}

const API_BASE = getApiBase();

async function fetchJSON(url) {
  const res = await fetch(`${API_BASE}${url}`);
  if (!res.ok) throw new Error(`API ${url}: ${res.status}`);
  return res.json();
}

async function postJSON(url, body = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${url}: ${res.status}`);
  return res.json();
}

/** GET /api/status — system overview */
export const fetchStatus = () => fetchJSON('/api/status');

/** GET /api/metrics — network metrics */
export const fetchMetrics = () => fetchJSON('/api/metrics');

/** GET /api/metrics/chart — traffic chart data */
export const fetchChartData = () => fetchJSON('/api/metrics/chart');

/** GET /api/devices — local + remote device info */
export const fetchDevices = () => fetchJSON('/api/devices');

/** GET /api/events — security events */
export const fetchEvents = (limit = 50) => fetchJSON(`/api/events?limit=${limit}`);

/** GET /api/flows — active flows */
export const fetchFlows = () => fetchJSON('/api/flows');

/** GET /api/interfaces — available capture interfaces */
export const fetchInterfaces = () => fetchJSON('/api/interfaces');

/** POST /api/monitoring/start */
export const startMonitoring = (iface) =>
  postJSON(`/api/monitoring/start${iface ? `?interface=${encodeURIComponent(iface)}` : ''}`);

/** POST /api/monitoring/stop */
export const stopMonitoring = () => postJSON('/api/monitoring/stop');

/** POST /api/simulate/traffic — trigger controlled traffic or attack simulation */
export const simulateTraffic = (scenario = 'normal', count = 50, sourceIp = '192.168.1.105') =>
  postJSON(`/api/simulate/traffic?scenario=${encodeURIComponent(scenario)}&count=${count}&source_ip=${encodeURIComponent(sourceIp)}`);

/** POST /api/events/clear — clear recorded security events */
export const clearEvents = () => postJSON('/api/events/clear');

/** GET /api/detection/model — metadata & feature importances of ML model */
export const fetchModelInfo = () => fetchJSON('/api/detection/model');

/** POST /api/devices/agent/connect — connect local test agent */
export const connectAgent = (host = '127.0.0.1', port = 5000) =>
  postJSON('/api/devices/agent/connect', { host, port });

/** POST /api/devices/agent/disconnect — disconnect agent */
export const disconnectAgent = () => postJSON('/api/devices/agent/disconnect');

/** POST /api/devices/agent/message — send test message and get real ACK & RTT */
export const sendAgentMessage = (message = 'NETSHIELD_PROBE') =>
  postJSON('/api/devices/agent/message', { message });

/** POST /api/simulate/custom — Custom Traffic Lab (detection_test or network_test) */
export const simulateCustomTraffic = (params) =>
  postJSON('/api/simulate/custom', params);

/** GET /api/agents — registered agents with status, IP, last-seen, RTT, quarantine */
export const fetchAgents = () => fetchJSON('/api/agents');

/** GET /api/messages — inter-agent message history */
export const fetchMessages = (limit = 100) => fetchJSON(`/api/messages?limit=${limit}`);

/** GET /api/sessions — active agent-to-agent sessions */
export const fetchSessions = () => fetchJSON('/api/sessions');

/** POST /api/agents/{agent_id}/quarantine — block an agent's messaging server-side */
export const quarantineAgent = (agentId) =>
  postJSON(`/api/agents/${encodeURIComponent(agentId)}/quarantine`);

/** POST /api/agents/{agent_id}/release — release a quarantined agent */
export const releaseAgent = (agentId) =>
  postJSON(`/api/agents/${encodeURIComponent(agentId)}/release`);

/** GET /api/quarantine/policy — get auto-quarantine parameters and whitelist */
export const fetchQuarantinePolicy = () => fetchJSON('/api/quarantine/policy');

/** POST /api/quarantine/policy — update auto-quarantine parameters */
export const updateQuarantinePolicy = (policy) => postJSON('/api/quarantine/policy', policy);

/**
 * Check if backend is reachable.
 * Returns { connected: true, data } or { connected: false }.
 */
export async function checkBackend() {
  try {
    const data = await fetchStatus();
    return { connected: true, data };
  } catch {
    return { connected: false, data: null };
  }
}
