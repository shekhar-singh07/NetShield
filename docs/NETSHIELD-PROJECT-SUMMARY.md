# NetShield-ML Project Summary

## 1. Executive summary

NetShield-ML is a distributed network intrusion detection and monitoring system. It uses:

- A **server node** that receives agent connections, monitors traffic, aggregates flows, detects suspicious activity, stores security events, and serves the dashboard.
- An **agent node** that connects to the server over TCP, identifies itself, sends periodic heartbeats, reports connection health, and can generate controlled traffic scenarios for demonstrations.
- A **React/Vite dashboard** that presents connectivity, traffic, flow, detection, and security-event information.
- A **FastAPI backend** that connects the dashboard to the TCP server, packet capture, flow analysis, detection engine, database, and simulation APIs.

The project supports both real packet capture when TShark/Wireshark is installed and a synthetic testbed fallback for environments such as GitHub Codespaces. ML training requires a real labelled flow dataset; synthetic packets remain available for exercising the runtime pipeline.

## 2. High-level architecture

```text
Agent computer
  agent/traffic_generator.py
        |
        | TCP port 5000
        | HELLO / HELLO_ACK
        | heartbeat / heartbeat_ack
        v
Server computer
  NetShieldServer
        |
        +--> PacketCapture (TShark, if installed)
        +--> FlowAnalyzer (5-tuple flows)
        +--> DetectionEngine (rules + Random Forest)
        +--> SQLite audit database
        +--> FastAPI API on port 8000
                         |
                         v
                  React/Vite dashboard
```

The default server configuration binds the TCP listener and API to `0.0.0.0`, allowing connections from other machines when network routing and firewalls permit them.

## 3. Server capabilities

The server is the central monitoring and security-analysis node.

### Agent and device management

The server can:

- Accept an agent TCP connection on port `5000`.
- Perform the `HELLO` / `HELLO_ACK` handshake.
- Record the agent hostname, IP address, source port, and connection time.
- Receive heartbeats approximately every three seconds.
- Track the last heartbeat and heartbeat sequence.
- Calculate round-trip time (RTT).
- Detect disconnects and heartbeat timeouts.
- Replace a stale active socket when a newer agent connects.
- Send a probe to the connected agent and verify a real acknowledgment.

### Traffic monitoring

When TShark is available and an interface is configured, the server can capture live Ethernet/IP/TCP/UDP traffic and calculate:

- Total packets processed.
- Packets per second.
- Bandwidth throughput.
- Active network flows.
- Protocol distribution for TCP, UDP, and ICMP/other traffic.
- Source and destination IP addresses.
- Source and destination ports.
- Packet and byte counts per flow.
- Flow duration.
- TCP SYN, ACK, RST, and FIN information.
- Average packet size and other detection features.

Flows are identified using a 5-tuple:

```text
Source IP
Destination IP
Source port
Destination port
Protocol
```

### Hybrid threat detection

The detection engine combines transparent heuristic rules with a Scikit-learn Random Forest model.

Rule-based signatures include:

- High packet rate / traffic spike.
- Many unique destination ports / port scan behavior.
- High TCP SYN connection rate / connection burst.
- Repeated failed or reset-heavy connections.

The model uses flow and sliding-window features including:

- Sustained packet rate.
- Short burst rate.
- Unique destination-port count.
- TCP connection rate.
- Reset count.
- Average packet size.
- SYN ratio.

Training is performed from CIC-IDS2017-style labelled CSV flow data or NSL-KDD
labelled rows configured through
`NETSHIELD_DATASET_PATH`. The application rejects old models without real-dataset
provenance and does not silently retrain on synthetic data.

Train explicitly with:

```powershell
python -m backend.detection.train_model C:\datasets\CICIDS2017 `
  --model backend\detection\nids_random_forest.pkl
```

The loader derives NetShield's seven runtime features from labelled flow columns,
groups destination ports by source IP for port-diversity features, and records
dataset provenance and class counts in the persisted model metadata.

The supported threat categories include:

- `NORMAL`
- `PORT_SCAN`
- `TRAFFIC_SPIKE`
- `SYN_BURST`

The ML path can provide class probabilities/confidence values. Detection events include an event type, severity, source/destination information where available, explanation, and confidence where applicable.

### Security-event audit trail

Security events are:

- Kept in a recent in-memory event queue for fast dashboard access.
- Persisted in SQLite through the database layer.
- Available through the Security dashboard.
- Clearable through the API.

This gives users both immediate alert visibility and a historical audit trail for demonstrations or investigations.

### Traffic simulation and testing

The server provides controlled synthetic traffic endpoints for environments without live packet capture. Supported scenarios include:

- Normal mixed traffic.
- Port-scan traffic.
- Traffic spikes.
- TCP connection/SYN bursts.
- Custom traffic and detection tests.

These simulations pass through the real flow analyzer and detection engine, so they are useful for validating metrics, alerts, event storage, and dashboard behavior.

## 4. Agent capabilities

The agent is implemented in `agent/traffic_generator.py` and uses the TCP client in `backend/networking/client.py`.

### Connection protocol

The agent:

1. Opens a TCP socket to the configured server and port.
2. Sends a newline-delimited JSON `hello` message.
3. Waits for `hello_ack`.
4. Starts a heartbeat loop.
5. Sends heartbeat messages with hostname, timestamp, sequence, and send time.
6. Receives heartbeat acknowledgments.
7. Responds to server probe messages with a real `probe_ack`.
8. Reports connection errors and disconnects.

### Agent-side traffic generation

The agent includes an interactive traffic-generation workflow for controlled demonstrations. It can generate normal traffic and attack-like scenarios such as:

- Port scans.
- UDP traffic bursts.
- TCP connection bursts.
- Normal mixed traffic.
- API-based simulation requests where configured.

The agent is intended to provide a repeatable source of test activity. It does not claim that every packet generated by the agent is automatically visible to the server's packet-capture interface; visibility depends on the server's capture configuration and operating-system permissions.

## 5. Dashboard features

The React dashboard uses the existing NetShield dark visual system and provides:

### Role selection and setup

- First-run server-versus-agent role selection.
- Persistent selected role in browser storage.
- Server setup status.
- Detected server hostname and IP.
- TCP listener and API port information.
- Packet-capture status and fallback reason.
- Change-role action.

### Overview

- Server and agent status.
- TCP connection state.
- RTT and heartbeat information.
- Packet, flow, throughput, and incident counters.
- Protocol distribution.
- Detection engine and ML model state.
- Recent security alerts.

### Live Monitoring

- Traffic metrics and charts.
- Protocol ratios.
- Active flow information.
- Monitoring/capture state.
- Interface information where supported.

### Security

- Security event queue.
- Severity and detection type.
- Detection explanations.
- ML confidence where available.
- Threat inspection details.
- Controlled attack simulation and testbed actions.
- Event clearing and export features where available in the page.

### Devices

- Local server information.
- Remote agent information.
- Hostname and endpoint.
- Connected/waiting state.
- RTT and last heartbeat.
- Agent connection diagnostics.
- Bidirectional probe/acknowledgment testing.

## 6. API surface

The FastAPI backend exposes the following main endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/status` | Server, agent, capture, detection, and model status |
| `GET /api/metrics` | Current packet, flow, throughput, protocol, and latency metrics |
| `GET /api/metrics/chart` | Traffic chart data |
| `GET /api/devices` | Local server and remote agent information |
| `GET /api/events` | Recent security events |
| `GET /api/flows` | Active 5-tuple network flows |
| `GET /api/interfaces` | Capture-interface and TShark availability |
| `POST /api/monitoring/start` | Start packet capture on a selected interface |
| `POST /api/monitoring/stop` | Stop packet capture and monitoring |
| `POST /api/simulate/traffic` | Generate normal or attack-like synthetic traffic |
| `POST /api/simulate/custom` | Generate custom test traffic |
| `POST /api/events/clear` | Clear security events |
| `GET /api/detection/model` | ML model metadata and feature information |
| `POST /api/devices/agent/connect` | Start a local test agent for single-machine testing |
| `POST /api/devices/agent/disconnect` | Stop the local test agent |
| `POST /api/devices/agent/message` | Send a server probe and await a real agent ACK |

The local-test-agent endpoint is intended for one-machine development/testing. A real two-computer deployment runs `agent/traffic_generator.py` on the agent computer.

## 7. User benefits

### Centralized visibility

The user can see the status of connected computers, traffic behavior, network flows, and security events from one command center.

### Faster incident awareness

Port scans, traffic spikes, SYN bursts, and other suspicious patterns can produce alerts before the user manually inspects every connection.

### Explainable detection

Heuristic rules provide readable reasons for alerts, while the Random Forest model adds multi-feature classification and confidence information.

### Connection-health assurance

Heartbeats and RTT show whether an agent is online and whether the connection is responsive, helping distinguish a network-health issue from a security event.

### Repeatable demonstrations

Synthetic scenarios make it possible to demonstrate the detection pipeline without needing a live attack or a fully configured packet-capture environment.

### Historical investigation

SQLite persistence provides an audit trail of detected security events rather than limiting the product to ephemeral dashboard notifications.

## 8. Current operating modes

### Full live-capture mode

Available when the server machine has:

- TShark/Wireshark installed.
- A valid capture interface configured.
- Sufficient operating-system permissions.
- Firewall access for the TCP and API ports.

In this mode, the server captures and analyzes live network traffic.

### Synthetic testbed mode

Used when TShark is unavailable, including the current GitHub Codespaces setup:

- Agent TCP connectivity works.
- HELLO/HELLO_ACK and heartbeat monitoring work.
- RTT and device status work.
- Synthetic packets and attack scenarios populate metrics and detections.
- Live LAN packet capture is unavailable.

The dashboard should distinguish agent connectivity from packet-capture health. A connected agent does not automatically mean that live packet capture is active.

## 9. Two-computer deployment

### Server computer

From the project root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The server exposes:

- FastAPI dashboard API on port `8000`.
- Agent TCP listener on port `5000`.

### Agent computer

Install the project dependencies and run:

```bash
python agent/traffic_generator.py --server <SERVER_IP> --port 5000
```

The agent computer must be able to reach the server's TCP port `5000`. Firewalls, routing, cloud port-forwarding, and port visibility can prevent the connection even when both applications are running.

### Codespaces demonstration

GitHub Codespaces can demonstrate the dashboard, API, TCP protocol, heartbeats, RTT, and synthetic detection scenarios. It is not equivalent to two physical LAN computers, and a browser incognito tab does not create a second machine or independent network interface.

## 10. Configuration

Important environment variables include:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SERVER_HOST` | `0.0.0.0` | TCP listener bind address |
| `SERVER_PORT` | `5000` | Agent TCP listener port |
| `API_HOST` | `0.0.0.0` | FastAPI bind address |
| `API_PORT` | `8000` | FastAPI port |
| `REMOTE_HOST` | `127.0.0.1` | Default agent target |
| `REMOTE_PORT` | `5000` | Default agent target port |
| `CAPTURE_INTERFACE` | empty | TShark capture interface |
| `DATABASE_PATH` | `netshield.db` | SQLite database path |
| `VITE_API_URL` | `http://localhost:8000` | Frontend API base URL |
| `DETECTION_PKT_RATE` | `500` | Traffic-spike threshold |
| `DETECTION_PORT_SCAN` | `15` | Unique-port threshold |
| `DETECTION_CONN_BURST` | `50` | SYN connection threshold |

## 11. Project structure

```text
NetShield/
├── agent/
│   └── traffic_generator.py
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── networking/
│   │   ├── client.py
│   │   └── server.py
│   ├── monitoring/
│   │   ├── packet_capture.py
│   │   ├── flow_analyzer.py
│   │   └── metrics.py
│   ├── detection/
│   │   ├── detector.py
│   │   ├── features.py
│   │   ├── rules.py
│   │   └── ml_detector.py
│   └── database/
│       └── database.py
├── src/
│   ├── App.jsx
│   ├── api.js
│   ├── components/
│   └── pages/
├── docs/
├── requirements.txt
└── package.json
```

## 12. Known limitations and product considerations

- TShark is not bundled with the project. Live packet capture requires a separate installation and interface configuration.
- The current agent workflow still requires the agent Python process to be launched on the agent computer; the browser cannot safely start an arbitrary remote process.
- One server instance currently focuses on one active agent socket at a time. A newer connection replaces a stale active connection.
- Browser tabs, including incognito tabs, share the same host environment and do not represent independent computers.
- A successful TCP heartbeat proves connectivity, not that packet capture is running.
- The product should not claim to monitor all LAN traffic unless the server's capture interface and permissions actually provide that visibility.
- The current CORS policy is permissive for development and should be restricted for a production deployment.
- Production deployments should add authentication, authorization, TLS, firewall hardening, and controlled multi-agent management.

## 13. Recommended demonstration sequence

1. Start the FastAPI backend.
2. Start the React frontend.
3. Open the dashboard and select **Run as Server**.
4. Verify the TCP listener is running.
5. Start the real agent process on the agent computer.
6. Open **Devices** and verify hostname, IP, heartbeat, and RTT.
7. If TShark is unavailable, open the Security simulation area.
8. Run normal traffic and observe packets, flows, throughput, and protocol metrics.
9. Run a port scan, traffic spike, or SYN burst.
10. Open the Security page and inspect the generated event, severity, reason, and ML information.
11. Explain packet-capture status separately from agent connection status.

## 14. Product value in one sentence

NetShield gives a user a centralized, explainable, and demonstrable way to monitor connected agents, understand network flows, detect suspicious traffic patterns, and investigate security events using both deterministic rules and machine-learning-assisted analysis.
