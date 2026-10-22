# NetShield-ML

**Distributed Network Intrusion & Attack Detection System**

GitHub Repository: [https://github.com/shekhar-singh07/NetShield.git](https://github.com/shekhar-singh07/NetShield.git)

---

## 1. Project Overview

**NetShield-ML** is a distributed Network Intrusion Detection System (NIDS) designed for monitoring LAN traffic, analyzing live network flows, and detecting malicious patterns using a hybrid inspection pipeline (heuristic rule signatures combined with a Scikit-Learn Random Forest machine learning model).

The system is built as a collaborative two-node distributed application:
- **Laptop A (Agent / Threat Simulator):** A lightweight agent that maintains a bidirectional TCP heartbeat channel with the server and includes an interactive traffic generator to simulate real network interactions and controlled attack vectors.
- **Laptop B (NIDS Server / Command Center):** The central monitoring node running packet capture/flow analysis, hybrid intrusion detection, an SQLite audit database, a FastAPI REST server, and a React real-time telemetry console.

### Computer Networks Component
- **Layer 4 TCP Socket Protocol:** Custom heartbeat protocol over raw TCP sockets (port 5000) exchanging newline-delimited JSON envelopes (`hello`, `hello_ack`, `heartbeat`, `heartbeat_ack`) measuring continuous round-trip time (RTT) latency.
- **5-Tuple Flow Aggregation:** Continuous tracking of IP flows (`Source IP`, `Destination IP`, `Source Port`, `Destination Port`, `Protocol`) tracking packet counts, byte throughput, TCP flags (`SYN`, `RST`, `ACK`, `FIN`), and flow duration.
- **Packet Capture Layer:** Native TShark (Wireshark CLI) integration parsing live Ethernet/IP/TCP/UDP frame headers, with automatic fallback to synthetic packet injection when TShark is unavailable.
- **Network Interface Binding:** Configurable multi-homed socket and API binding (`0.0.0.0`) supporting cross-LAN routing.

### Data Science / Machine Learning Component
- **Model Architecture:** Scikit-Learn `RandomForestClassifier` (60 decision trees) trained on multi-dimensional flow feature vectors.
- **Feature Engineering:** Features extracted in sliding windows (30-second window and 2-second burst span):
  - `packet_rate`: Sustained throughput (packets/sec).
  - `burst_rate`: Instantaneous rate in the last 2 seconds.
  - `unique_dst_ports`: Destination port diversity (identifies port scans).
  - `connection_rate`: TCP SYN connection request velocity.
  - `rst_count`: Reset flag count (identifies rejected/abrupt connections).
  - `avg_packet_size`: Mean payload length in bytes.
  - `syn_ratio`: Fraction of SYN packets relative to total traffic.
- **Target Threat Classes:**
  - `NORMAL`: Benign HTTP/HTTPS/DNS traffic patterns.
  - `PORT_SCAN`: Horizontal port scanning reconnaissance.
  - `TRAFFIC_SPIKE`: Volumetric flooding / DDoS packet bursts.
  - `SYN_BURST`: Rapid TCP handshake exhaustion attacks.
- **Output:** Classification labels with probabilistic confidence scores (`0.0% – 100.0%`) and automated firewall mitigation rule suggestions.

---

## 2. Architecture

```
                    ┌────────────────────────────────────────┐
                    │       Laptop A (NetShield Agent)       │
                    │   • TCP Socket Client (Port 5000)      │
                    │   • Interactive Traffic Generator      │
                    └───────────────────┬────────────────────┘
                                        │
                         TCP Connection │ Wi-Fi / Local Area Network
                                        │ (e.g. 192.168.1.0/24)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           Laptop B (NetShield Server)                            │
│                                                                                  │
│   ┌────────────────────────┐                   ┌─────────────────────────────┐   │
│   │ TCP Server (:5000)     │                   │ Packet Capture Layer        │   │
│   │ • Agent HELLO & RTT    │                   │ • TShark (Wireshark CLI)    │   │
│   │ • 3s Heartbeat Loop    │                   │ • Synthetic Packet Fallback │   │
│   └───────────┬────────────┘                   └──────────────┬──────────────┘   │
│               │                                               │                  │
│               ▼                                               ▼                  │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │ Flow Analyzer (5-Tuple Session State, Protocols, Bandwidth, Rate)        │   │
│   └───────────────────────────────────┬──────────────────────────────────────┘   │
│                                       ▼                                          │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │ Feature Extractor (Windowed Packet Rates, Port Diversity, Flag Ratios)   │   │
│   └───────────────────────────────────┬──────────────────────────────────────┘   │
│                                       ▼                                          │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │ Hybrid Detection Engine                                                  │   │
│   │ ├── Rule-Based Signatures (PORT_SCAN_LIKE, TRAFFIC_SPIKE, BURST)         │   │
│   │ └── Phase 3: ML Engine (RandomForest-NIDS v1.0 with Confidence Score)    │   │
│   └─────────────────────┬─────────────────────────────┬──────────────────────┘   │
│                         ▼                             ▼                          │
│               ┌───────────────────┐         ┌───────────────────┐                │
│               │ SQLite Database   │         │ FastAPI Backend   │                │
│               │ (`netshield.db`)  │         │ (Port 8000)       │                │
│               └───────────────────┘         └─────────┬─────────┘                │
└───────────────────────────────────────────────────────┼──────────────────────────┘
                                                        │ REST API / CORS
                                                        ▼
                    ┌────────────────────────────────────────┐
                    │ React 19 + Vite 8 Dashboard (:5173)    │
                    │ • Overview & Top Device Telemetry      │
                    │ • Attack Simulation Studio             │
                    │ • SVG Live Traffic & Protocol Charts   │
                    │ • Active 5-Tuple Network Flows Table   │
                    │ • Alerts Queue, Mitigation & CSV Export│
                    └────────────────────────────────────────┘
```

---

## 3. Repository Structure

```
NetShield/
├── .env.example                 # Configuration template for Laptop A and Laptop B
├── .gitignore                   # Git exclusion rules (venv, node_modules, db, etc.)
├── package.json                 # React / Vite / Tailwind frontend package manifest
├── requirements.txt             # Python backend dependencies
├── test_pipeline.py             # End-to-end verification and regression test suite
├── vite.config.js               # Vite build and LAN dev-server configuration
│
├── agent/
│   └── traffic_generator.py     # Laptop A CLI agent & attack simulator
│
├── backend/
│   ├── config.py                # Environment variable resolution & .env auto-loader
│   ├── main.py                  # FastAPI application entry point & REST endpoints
│   ├── requirements.txt         # Backend dependency list (identical to root)
│   ├── database/
│   │   └── database.py          # SQLite schema, event logging, and queries
│   ├── detection/
│   │   ├── detector.py          # Hybrid DetectionEngine (Rules + ML pipeline)
│   │   ├── features.py          # Sliding-window FeatureExtractor
│   │   ├── ml_detector.py       # Scikit-Learn RandomForest classifier
│   │   └── rules.py             # Heuristic rule-based detection signatures
│   ├── monitoring/
│   │   ├── flow_analyzer.py     # 5-tuple flow aggregation & bandwidth tracker
│   │   ├── metrics.py           # System and network metrics collector
│   │   └── packet_capture.py    # TShark subprocess wrapper & output parser
│   └── networking/
│       ├── client.py            # Standalone TCP heartbeat client for Laptop A
│       └── server.py            # TCP socket server for Laptop B (port 5000)
│
└── src/
    ├── api.js                   # Centralized API client (supports VITE_API_URL)
    ├── App.jsx                  # Main React application & router configuration
    ├── index.css                # Tailwind CSS v4 styling & theme tokens
    ├── main.jsx                 # React DOM entry point
    ├── components/
    │   ├── DeviceStatus.jsx     # Live device, remote agent, & NIDS telemetry row
    │   ├── Navbar.jsx           # Header navigation bar & backend status beacon
    │   ├── ProtocolDistribution.jsx # Protocol percentage breakdown bars
    │   ├── SecurityEventTable.jsx   # Alerts queue with CSV export & mitigation modal
    │   ├── SimulationPanel.jsx  # 1-click attack simulation & testbed studio
    │   └── TrafficChart.jsx     # Custom SVG area chart with interactive crosshair
    └── pages/
        ├── DevicesPage.jsx      # Multi-node topology & connection status
        ├── MonitoringPage.jsx   # Live capture controls, metrics, & active flows
        ├── OverviewPage.jsx     # Command center overview dashboard
        └── SecurityPage.jsx     # ML model diagnostics, feature weights, & alerts
```

---

## 4. Prerequisites

### Software Requirements
- **Python:** Version `3.10`, `3.11`, `3.12`, or `3.13`.
- **Node.js:** Version `18.x` or higher (includes `npm`).
- **Git:** Installed on both machines.

### Packet Capture (Wireshark / TShark)
*Packet capture is optional for simulation and testing.* NetShield includes synthetic packet injection and software socket monitoring so that rule detection and pipeline testing work even if Wireshark is not installed. The ML model no longer trains on synthetic data: it loads a persisted model trained from a real labelled flow dataset, or remains unavailable until one is configured. For capturing raw physical network packets:

### Training the ML model from real data

Download a labelled flow dataset such as CIC-IDS2017 or NSL-KDD, keep its files outside
the repository, and point NetShield at the file or directory:

```powershell
$env:NETSHIELD_DATASET_PATH = "C:\datasets\CICIDS2017"
python -m backend.detection.train_model C:\datasets\CICIDS2017 `
  --model backend\detection\nids_random_forest.pkl
```

The loader accepts CIC-IDS-style columns such as `Flow Duration`, `Flow Packets/s`,
`SYN Flag Count`, `RST Flag Count`, `Average Packet Size`, `Destination Port`,
and `Label`. NSL-KDD's fixed 43-column rows are also supported. It maps
`BENIGN`/`normal` to `NORMAL`, port scanning/probe labels to `PORT_SCAN`, and
volumetric DoS/DDoS labels to `TRAFFIC_SPIKE`. Unsupported or malformed rows
are skipped and reported in the model metadata. The trained model stores its
dataset path, row counts, class counts, and real-dataset provenance. Old
synthetic models are rejected.

- **Windows:**
  1. Download and install Wireshark from [https://www.wireshark.org/download.html](https://www.wireshark.org/download.html).
  2. Ensure **Npcap** is checked during installation.
  3. Ensure `tshark.exe` is located at `C:\Program Files\Wireshark\tshark.exe` or added to your system `PATH`.
- **Linux (Ubuntu / Debian):**
  ```bash
  sudo apt update
  sudo apt install -y tshark
  # Allow non-root users to capture packets:
  sudo dpkg-reconfigure wireshark-common
  sudo usermod -aG wireshark $USER
  ```
  *(Log out and back in for group changes to take effect).*

---

## 5. Installation After Cloning

Run these steps in your terminal immediately after cloning.

### Step 1: Clone Repository & Enter Directory
```bash
git clone https://github.com/shekhar-singh07/NetShield.git
cd NetShield
```

### Step 2: Python Virtual Environment Setup

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```
*(If PowerShell blocks script execution, run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*

**Windows (Command Prompt):**
```cmd
python -m venv venv
venv\Scripts\activate.bat
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Backend Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Install Frontend Dependencies
```bash
npm install
```

### Step 5: Create `.env` from `.env.example`

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Windows (Command Prompt):**
```cmd
copy .env.example .env
```

**Linux / macOS:**
```bash
cp .env.example .env
```

---

## 6. Configuration

NetShield-ML reads configuration parameters from `.env` in the root folder, system environment variables, or CLI arguments.

### Environment Variable Reference

| Variable | Default | Machine | Description |
| -------- | ------- | ------- | ----------- |
| `SERVER_HOST` | `0.0.0.0` | **Laptop B** | IP interface for TCP socket server (:5000). `0.0.0.0` binds to all LAN interfaces. |
| `SERVER_PORT` | `5000` | **Laptop B** | Port for incoming agent TCP connections. |
| `API_HOST` | `0.0.0.0` | **Laptop B** | Bind IP for FastAPI REST server. `0.0.0.0` allows LAN browser access. |
| `API_PORT` | `8000` | **Laptop B** | Port for FastAPI REST server. |
| `REMOTE_HOST` | `127.0.0.1` | **Laptop A** | Target LAN IP of Laptop B that the agent connects to. |
| `REMOTE_PORT` | `5000` | **Laptop A** | Target port on Laptop B (matches `SERVER_PORT`). |
| `REMOTE_API_PORT` | `8000` | **Laptop A** | Target API port on Laptop B for HTTP simulations. |
| `CAPTURE_INTERFACE` | `""` | **Laptop B** | Name or index of capture interface (e.g. `Wi-Fi`, `eth0`, or index `1`). |
| `DATABASE_PATH` | `netshield.db`| **Laptop B** | Path to persistent SQLite database file. |
| `VITE_API_URL` | `http://localhost:8000` | **Frontend** | Backend URL. Set to `http://<LAPTOP_B_IP>:8000` if viewing UI from Laptop A. |
| `DETECTION_PKT_RATE` | `500` | **Laptop B** | High packet rate threshold for `TRAFFIC_SPIKE`. |
| `DETECTION_PORT_SCAN` | `15` | **Laptop B** | Unique destination port threshold for `PORT_SCAN_LIKE`. |
| `DETECTION_CONN_BURST` | `50` | **Laptop B** | SYN connection rate threshold for `CONNECTION_BURST`. |

> **Which values belong where?**
> - **On Laptop B (Server):** Keep `SERVER_HOST=0.0.0.0`, `SERVER_PORT=5000`, `API_HOST=0.0.0.0`, `API_PORT=8000`. Set `CAPTURE_INTERFACE` to your Wi-Fi/Ethernet interface name if TShark is installed.
> - **On Laptop A (Agent):** Set `REMOTE_HOST=<Laptop-B-IP>` (e.g. `192.168.1.50`) and `REMOTE_PORT=5000`.

---

## 7. Running Locally on One Laptop

You can validate the entire pipeline on a single computer using localhost.

> [!NOTE]
> Localhost testing verifies that the FastAPI backend, detection engine, database logging, and React UI function correctly. However, localhost testing does **not** replace physical multi-node Wi-Fi/LAN validation.

Open three separate terminals in the project root with the virtual environment activated:

### Terminal 1: Backend Server (Computer B)
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
*Expected output: TCP Server running on `0.0.0.0:5000`, Uvicorn running on `http://0.0.0.0:8000`.*

### Terminal 2: React Dashboard
```bash
npm run dev
```
*Open [http://localhost:5173](http://localhost:5173) in your browser. The beacon in the top right will show `BACKEND CONNECTED`.*

### Terminal 3: Traffic Generator / Agent (Computer A simulation)
```bash
python agent/traffic_generator.py --server 127.0.0.1 --port 5000
```
*The agent will connect, exchange HELLO, and stream periodic heartbeats.*

---

## 8. Two-Laptop Demonstration

Follow this exact step-by-step procedure to demonstrate NetShield across two physical laptops.

```
Laptop A (192.168.1.105)                 Laptop B (192.168.1.50)
+-----------------------+                +-----------------------+
|  traffic_generator.py |                |  backend/main.py      |
|  (Agent Client)       |--- TCP :5000 ->|  (TCP Server :5000)   |
|                       |                |  (FastAPI API :8000)  |
|                       |                |  (Detection Engine)   |
+-----------------------+                +-----------┬-----------+
                                                     │ HTTP
                                                     ▼
                                         +-----------------------+
                                         |  React Dashboard      |
                                         |  http://localhost:5173|
                                         +-----------------------+
```

### Step 8.1: Connect Both Laptops to the Same Network
Connect Laptop A and Laptop B to the same Wi-Fi router, mobile hotspot, or Ethernet switch.

### Step 8.2: Identify Laptop B's LAN IP Address
On **Laptop B**, open a terminal and run:
- **Windows:**
  ```cmd
  ipconfig
  ```
  Look for `IPv4 Address` under your active Wi-Fi or Ethernet adapter (e.g. `192.168.1.50`).
- **Linux:**
  ```bash
  ip -br addr show
  ```
  *(Record this IP — referred to below as `<LAPTOP_B_IP>`)*.

### Step 8.3: Start the Backend on Laptop B
On **Laptop B**, run:
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Step 8.4: Start the Dashboard on Laptop B
On **Laptop B**, open a second terminal and run:
```bash
npm run dev
```
Open `http://localhost:5173` on Laptop B.

### Step 8.5: Start the Agent on Laptop A
On **Laptop A**, open the NetShield dashboard backed by Laptop A's local service, choose
**Run as Agent**, enter Laptop B's LAN address, and click **Connect to server**.
The setup screen starts the local agent connection through the backend; no command needs
to be copied or typed. The equivalent developer command is:
```bash
python agent/traffic_generator.py --server <LAPTOP_B_IP> --port 5000
```
*(Example: `python agent/traffic_generator.py --server 192.168.1.50 --port 5000`)*

### Step 8.6: Verify the Connection on Laptop B's Dashboard
1. Go to the **Devices** page (`http://localhost:5173/devices`).
2. Verify that **COMPUTER A (AGENT)** changes from `WAITING` to `CONNECTED` (green beacon).
3. Observe the live **RTT Latency** (e.g. `1.8 ms`) and incrementing **Heartbeat Sequence** updating every 3 seconds.

### Step 8.7: Generate Normal Traffic from Laptop A
In Laptop A's terminal menu, select:
```
[7] Trigger Detection via API: Normal Mixed Traffic
```
- Switch to the **Live Monitoring** page on the dashboard (`http://localhost:5173/monitoring`).
- Observe that total packets, throughput, and protocol ratios (TCP, UDP, ICMP) update in real time.
- Scroll down to the **Active Network Flows** table and verify that the 5-tuple flow entries appear.

### Step 8.8: Execute Controlled Attack Simulations from Laptop A
In Laptop A's terminal menu, execute the simulated attack scenarios:

1. **Port Scan Simulation:**
   ```
   Enter choice: 1  (Real Sockets)
   -- OR --
   Enter choice: 4  (Via API Testbed)
   ```
2. **Volumetric Traffic Spike:**
   ```
   Enter choice: 2  (Real UDP Datagrams)
   -- OR --
   Enter choice: 5  (Via API Testbed)
   ```
3. **SYN Connection Burst:**
   ```
   Enter choice: 3  (Real TCP Handshakes)
   -- OR --
   Enter choice: 6  (Via API Testbed)
   ```

### Step 8.9: Observe Detection on the Dashboard
1. Open the **Security** page (`http://localhost:5173/security`) or **Overview** page (`http://localhost:5173/`).
2. Verify that threat alerts appear in the **Security Events Queue**:
   - `[HIGH] ML_PORT_SCAN`: Flagged by the Random Forest model with confidence (e.g. `90.0%`).
   - `[HIGH] PORT_SCAN_LIKE`: Flagged by heuristic rule (destination port count `> 15`).
   - `[HIGH] TRAFFIC_SPIKE`: Flagged by packet rate threshold.
3. Click **Details** on any alert row to open the **Threat Inspection Modal**:
   - Inspect the ML confidence meter.
   - Inspect the 5-tuple endpoints (`Source IP`, `Dest IP`, `Protocol`).
   - Review the recommended firewall mitigation rule (e.g. `sudo iptables -A INPUT -s 192.168.1.105 -j DROP`).
   - Click **Copy Rule** to copy the command to clipboard.
4. Click **Export** to download the complete event audit trail as a `.csv` file.

---

## 9. Firewall / Port 5000 Troubleshooting

If Laptop A reports `ConnectionRefusedError` or `Connection timeout` when trying to reach Laptop B:

Laptop B's operating system firewall may be blocking inbound traffic on TCP port `5000` (agent socket) and TCP port `8000` (FastAPI REST).

### Allowing Inbound Ports on Windows (Laptop B)

Run PowerShell as **Administrator**:
```powershell
# Allow inbound TCP port 5000 (Agent Socket)
New-NetFirewallRule -DisplayName "NetShield TCP Server" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow

# Allow inbound TCP port 8000 (FastAPI REST)
New-NetFirewallRule -DisplayName "NetShield REST API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

### Allowing Inbound Ports on Linux (Laptop B)

Using `ufw`:
```bash
sudo ufw allow 5000/tcp comment "NetShield TCP Server"
sudo ufw allow 8000/tcp comment "NetShield REST API"
sudo ufw status
```

### Verifying Port Reachability from Laptop A
From Laptop A, test if Laptop B's port is reachable over the network:
- **Windows (PowerShell):**
  ```powershell
  Test-NetConnection -ComputerName <LAPTOP_B_IP> -Port 5000
  ```
  *(Check if `TcpTestSucceeded : True`)*.
- **Linux / macOS:**
  ```bash
  nc -zv <LAPTOP_B_IP> 5000
  ```

---

## 10. Packet Capture Troubleshooting

If you want to use live packet capture via TShark:

### 1. Identify Available Interfaces
Run in terminal on Laptop B:
```bash
tshark -D
```
Example output:
```
1. \Device\NPF_{12345678-ABCD-EF01-2345-6789ABCDEF01} (Wi-Fi)
2. \Device\NPF_{87654321-DCBA-10FE-5432-10FEDCBA9876} (Ethernet)
```

### 2. Configure Interface in `.env`
Set `CAPTURE_INTERFACE` to the interface name or index:
```env
CAPTURE_INTERFACE=Wi-Fi
# OR
CAPTURE_INTERFACE=1
```
Or select the interface dynamically from the dropdown on the **Live Monitoring** page in the dashboard.

### 3. Diagnosing Permission & Interface Errors
- **Windows:** If TShark reports access denied, ensure the **Npcap** service is running:
  ```cmd
  net start npcap
  ```
- **Linux:** If TShark reports `Permission denied`, ensure your user belongs to the `wireshark` group:
  ```bash
  sudo usermod -aG wireshark $USER
  ```
- **Synthetic Injection Fallback:** If TShark is not installed or configured, NetShield automatically operates in synthetic testbed mode. Synthetic packets injected via the simulation studio flow through the identical `FlowAnalyzer`, `FeatureExtractor`, and `DetectionEngine`.

---

## 11. Demo Checklist

Use this checklist during presentations or project evaluations:

- [ ] Both laptops connected to the same Wi-Fi / LAN network.
- [ ] Laptop B LAN IP identified (`ipconfig` or `ip -br addr show`).
- [ ] Laptop B firewall permits inbound TCP on port `5000` and `8000`.
- [ ] Backend running on Laptop B (`python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000`).
- [ ] React dashboard active on Laptop B (`npm run dev`) and showing `BACKEND CONNECTED`.
- [ ] Laptop A agent launched (`python agent/traffic_generator.py --server <LAPTOP_B_IP> --port 5000`).
- [ ] Devices page on dashboard shows Computer A status as `CONNECTED` with live RTT latency.
- [ ] Normal traffic generated from Laptop A; packets and flows visible in Live Monitoring.
- [ ] Attack simulation triggered from Laptop A (Port Scan or Traffic Spike).
- [ ] Security alert queue updates with severity badges, ML classification, and confidence score.
- [ ] Threat Details modal inspected, showing recommended firewall mitigation command.
- [ ] CSV audit export downloaded.

---

## 12. Verification & Automated Tests

NetShield includes an automated end-to-end regression test script: [`test_pipeline.py`](test_pipeline.py).

To run the verification test:
```bash
python test_pipeline.py
```

### What `test_pipeline.py` Verifies:
1. **GET `/api/status`:** Validates system health, host IP, uptime, and detection engine mode (`Hybrid Rules + ML RandomForest`).
2. **POST `/api/simulate/traffic?scenario=port_scan`:** Generates 25+ unique destination port probes; verifies that immediate feature analysis triggers.
3. **POST `/api/simulate/traffic?scenario=traffic_spike`:** Bursts 550 packets; verifies high-rate volumetric analysis.
4. **GET `/api/events`:** Confirms both heuristic rules (`PORT_SCAN_LIKE`) and machine learning (`ML_PORT_SCAN`) generated alerts stored in SQLite.
5. **GET `/api/metrics`:** Validates total packet counters, packet rates, throughput (Mbps), and active flow counts.
6. **GET `/api/devices`:** Validates local node and remote agent socket state telemetry.
7. **GET `/api/detection/model`:** Inspects the active `RandomForest-NIDS v1.0` model, validation accuracy (`100%`), target classes, and top Gini feature importances.

---

## 13. Current Validation Status

To ensure engineering transparency:

| Validation Scope | Status | Notes |
| ---------------- | ------ | ----- |
| **Component Unit & Pipeline Tests** | ✅ **Passed** | Fully verified via `test_pipeline.py` (FastAPI, SQLite, Rules, ML model). |
| **Localhost / Single-Machine Validation** | ✅ **Passed** | Fully verified with Server, Agent, and React UI running concurrently. |
| **Frontend Production Build** | ✅ **Passed** | Vite production bundle compiles cleanly with 0 errors (`npm run build`). |
| **Physical Two-Laptop LAN Validation** | 🟡 **Pending** | Software is fully architected and configured for two-laptop LAN deployment (bindings, environment configuration, CORS, dynamic host resolution). Physical execution across two distinct hardware laptops on a physical router remains to be performed during the live lab demonstration. |

---

## 14. Safety & Scope

- **Controlled Lab Use Only:** All attack simulations (Port Scan, Traffic Spike, Connection Burst) and traffic generation scripts in this repository are intended **strictly for educational demonstration in a controlled laboratory environment** on hardware owned and authorized by the project team.
- **No External Targeting:** Do not point the agent or attack simulator at unauthorized IP addresses, public infrastructure, or networks you do not own.

---

## License

Developed as an academic Computer Networks and Network Security project.
