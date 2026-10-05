/**
 * NetShield-ML — API Layer
 * Centralized API calls to the FastAPI backend.
 * All data comes from real backend — never fabricated.
 */

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost'
    ? `http://${window.location.hostname}:8000`
    : 'http://localhost:8000');

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
