# Project Structure

## Classification

Full-stack application: a React/Vite frontend, FastAPI/Python backend, and a separate Python TCP traffic-generator/agent for distributed LAN demonstrations.

## Top-level modules

| Area | Location | Responsibility |
|---|---|---|
| Frontend shell | `src/App.jsx`, `src/main.jsx` | Browser routing, role gate, backend reachability |
| Frontend pages | `src/pages/` | Setup, overview, monitoring, security, devices |
| Frontend components | `src/components/` | Charts, metrics, event table, simulations, agent controls |
| API client | `src/api.js` | REST calls to FastAPI |
| Backend entrypoint | `backend/main.py` | FastAPI routes and component wiring |
| Networking | `backend/networking/` | TCP server/client, HELLO/ACK, heartbeat, probe RTT |
| Monitoring | `backend/monitoring/` | TShark capture, 5-tuple flow state, metrics |
| Detection | `backend/detection/` | Sliding-window features, heuristic rules, ML inference |
| Persistence | `backend/database/` | SQLite security-event and flow-summary schema |
| Distributed agent | `agent/traffic_generator.py` | TCP agent and controlled socket traffic generation |

## Runtime entrypoints

- Browser: `index.html` -> `src/main.jsx` -> `src/App.jsx`.
- API: `backend/main.py` exposes `app`; normally run with Uvicorn on port 8000.
- Agent: `agent/traffic_generator.py` CLI, or `backend/networking/client.py` for a TCP client.
- Optional live capture: TShark subprocess started by `backend/monitoring/packet_capture.py`.

## Layers

1. Presentation: React pages/components and polling API client.
2. HTTP/API orchestration: FastAPI route handlers in `backend/main.py`.
3. Network acquisition: TShark parser and TCP server/client.
4. Analysis: flow aggregation, metrics, feature extraction, rules, Random Forest.
5. Persistence: SQLite event store.

## Functional domains

Role/setup, distributed device health, live traffic monitoring, flow inspection, attack simulation, intrusion detection, ML diagnostics, and security-event audit.

