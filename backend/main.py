"""
NetShield-ML — FastAPI Backend (Computer B)
Main entry point. Wires together:
  - TCP Server (for Computer A agent connections)
  - Packet Capture (TShark)
  - Flow Analyzer
  - Metrics Collector
  - Detection Engine
  - SQLite Database
  - REST API for the React dashboard

Start with:
    cd backend
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
import time
import socket
import threading
import logging
import os
import sys

# Ensure backend directory is in sys.path regardless of working directory
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import (
    SERVER_HOST, SERVER_PORT, CAPTURE_INTERFACE,
    API_HOST, API_PORT, DATABASE_PATH,
    DETECTION_PACKET_RATE_THRESHOLD,
    DETECTION_PORT_SCAN_THRESHOLD,
    DETECTION_CONNECTION_BURST_THRESHOLD,
    get_local_hostname, get_local_ip,
)
from networking.server import NetShieldServer
from networking.multi_agent import MultiAgentRegistry
from monitoring.packet_capture import PacketCapture
from monitoring.flow_analyzer import FlowAnalyzer
from monitoring.metrics import MetricsCollector
from detection.detector import DetectionEngine
from database.database import (
    init_db, store_event, get_events, get_event_counts, clear_events,
    get_conversation, get_recent_messages,
)

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("netshield.main")

# ── Initialize components ──
init_db(DATABASE_PATH)

flow_analyzer = FlowAnalyzer()
metrics_collector = MetricsCollector(flow_analyzer)

# Security event storage (in-memory recent + SQLite persistent)
_recent_events = []
_events_lock = threading.Lock()


def on_security_event(event: dict):
    """Callback when detection engine produces an event."""
    with _events_lock:
        _recent_events.insert(0, event)
        if len(_recent_events) > 200:
            _recent_events[:] = _recent_events[:200]
    store_event(event)

    # Automated quarantine evaluation with defense-in-depth against false alarms
    try:
        if "tcp_server" in globals() and tcp_server and getattr(tcp_server, "registry", None):
            tcp_server.registry.evaluate_security_event(event)
    except Exception as e:
        logger.error(f"Error evaluating auto-quarantine for event: {e}")


detection_engine = DetectionEngine(
    packet_rate_threshold=DETECTION_PACKET_RATE_THRESHOLD,
    port_scan_threshold=DETECTION_PORT_SCAN_THRESHOLD,
    connection_burst_threshold=DETECTION_CONNECTION_BURST_THRESHOLD,
    on_event=on_security_event,
)


def on_packet(packet: dict):
    """Callback for each captured packet — feeds into flow analyzer + detector."""
    flow_analyzer.process_packet(packet)
    detection_engine.process_packet(packet)


packet_capture = PacketCapture(interface=CAPTURE_INTERFACE, on_packet=on_packet)
tcp_server = NetShieldServer(
    host=SERVER_HOST, port=SERVER_PORT, on_packet=on_packet,
    registry=MultiAgentRegistry(on_security_event=on_security_event),
)

# Chart data recording thread
_chart_thread_running = False


def _chart_recorder():
    """Record traffic chart data points every 2 seconds from real metrics."""
    global _chart_thread_running
    _chart_thread_running = True
    while _chart_thread_running:
        if metrics_collector.is_monitoring:
            stats = flow_analyzer.get_stats()
            bw = stats["bandwidth_mbps"]
            # Simple RX/TX split approximation (real capture doesn't
            # easily distinguish direction without interface info)
            metrics_collector.record_chart_point(
                rx_mbps=round(bw * 0.6, 2),
                tx_mbps=round(bw * 0.4, 2),
            )
        time.sleep(2.0)


# ── FastAPI App ──
app = FastAPI(
    title="NetShield-ML API",
    description="Distributed Network Intrusion & Attack Detection System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    """Start background services."""
    tcp_server.start()
    detection_engine.start()

    # Auto-start packet capture & monitoring
    if packet_capture.available:
        iface = CAPTURE_INTERFACE
        if not iface:
            # Auto-detect best interface (Wi-Fi or Ethernet)
            try:
                ifaces = packet_capture.get_interfaces()
                for cand in ifaces:
                    cand_lower = cand.lower()
                    if "wi-fi" in cand_lower or "ethernet" in cand_lower:
                        iface = cand.split(".")[0].strip()
                        break
                if not iface and ifaces:
                    iface = ifaces[0].split(".")[0].strip()
            except Exception as e:
                logger.warning(f"Failed to auto-detect interface: {e}")

        if iface:
            logger.info(f"Auto-starting packet capture on interface {iface}")
            started = packet_capture.start(iface)
            if started:
                metrics_collector.start_monitoring()
                logger.info(f"Live packet capture active on interface {iface}")
            else:
                logger.warning(f"Could not auto-start capture: {packet_capture.unavailable_reason}")
                metrics_collector.start_monitoring()
        else:
            metrics_collector.start_monitoring()
    else:
        logger.info("TShark unavailable — running in monitoring mode")
        metrics_collector.start_monitoring()

    # Start chart recording thread
    t = threading.Thread(target=_chart_recorder, daemon=True)
    t.start()
    logger.info(f"NetShield backend started")
    logger.info(f"  TCP Server: {SERVER_HOST}:{SERVER_PORT}")
    logger.info(f"  Capture Interface: {packet_capture.interface or CAPTURE_INTERFACE or '(not configured)'}")
    logger.info(f"  TShark available: {packet_capture.available}")
    logger.info(f"  Packet capture running: {packet_capture._running}")
    logger.info(f"  Monitoring active: {metrics_collector.is_monitoring}")


@app.on_event("shutdown")
def shutdown():
    """Stop background services."""
    global _chart_thread_running
    _chart_thread_running = False
    packet_capture.stop()
    tcp_server.stop()
    detection_engine.stop()


# ════════════════════════════════════════
#  API ROUTES
# ════════════════════════════════════════

@app.get("/api/status")
def get_status():
    """System status overview."""
    remote = tcp_server.get_remote_state()
    # Remove internal tracking fields
    remote_clean = {k: v for k, v in remote.items() if not k.startswith("_")}
    detection_status = detection_engine.get_status()
    counts = detection_engine.get_counts()

    return {
        "system": "NetShield-ML",
        "version": "1.0.0",
        "hostname": get_local_hostname(),
        "ip": get_local_ip(),
        "monitoring": metrics_collector.is_monitoring,
        "uptime_seconds": round(metrics_collector.get_uptime(), 1),
        "tcp_server": {
            "host": SERVER_HOST,
            "port": SERVER_PORT,
            "running": tcp_server._running,
        },
        "api_server": {
            "host": API_HOST,
            "port": API_PORT,
        },
        "remote_device": remote_clean,
        "packet_capture": {
            "available": packet_capture.available,
            "running": packet_capture._running,
            "interface": packet_capture.interface or None,
            "reason": packet_capture.unavailable_reason if not packet_capture.available else None,
        },
        "detection": {
            "mode": detection_status["mode"],
            "running": detection_status["running"],
            "ml_model_loaded": detection_status["ml_model_loaded"],
            "ml_model_name": detection_status["ml_model_name"],
            "rules": detection_status["rules"],
        },
        "counts": counts,
    }


@app.get("/api/metrics")
def get_metrics():
    """Network metrics from real packet capture."""
    metrics = metrics_collector.get_metrics()
    remote = tcp_server.get_remote_state()
    metrics["latency_ms"] = remote.get("rtt_ms")
    return metrics


@app.get("/api/metrics/chart")
def get_chart_data():
    """Traffic chart data points."""
    return {"data": metrics_collector.get_chart_data()}


@app.get("/api/devices")
def get_devices():
    """Local and remote device information."""
    remote = tcp_server.get_remote_state()
    remote_clean = {k: v for k, v in remote.items() if not k.startswith("_")}

    return {
        "local": {
            "hostname": get_local_hostname(),
            "ip": get_local_ip(),
            "status": "online",
            "interface": packet_capture.interface or "(not configured)",
        },
        "remote": remote_clean,
        "tcp_server": {
            "host": SERVER_HOST,
            "port": SERVER_PORT,
            "running": tcp_server._running,
        },
    }


@app.get("/api/agents")
def get_agents():
    """Return list of registered agents and their status."""
    return {
        "agents": tcp_server.registry.get_agents_status(),
        "total": len(tcp_server.registry.agents),
    }


@app.get("/api/messages")
def get_messages_endpoint(agent_a: str = None, agent_b: str = None, limit: int = 100):
    """
    Fetch message history.
    If agent_a and agent_b are provided, return conversation between them.
    Otherwise return recent messages across all agents.
    """
    if agent_a and agent_b:
        msgs = get_conversation(agent_a, agent_b, limit=limit)
    else:
        msgs = get_recent_messages(limit=limit)
    return {
        "messages": msgs,
        "count": len(msgs),
    }


@app.get("/api/sessions")
def get_sessions_endpoint():
    """Active agent-to-agent sessions from the multi-agent registry."""
    sessions = tcp_server.registry.get_active_sessions_list()
    return {"sessions": sessions, "total": len(sessions)}


@app.post("/api/agents/{agent_id}/quarantine")
def quarantine_agent_endpoint(agent_id: str):
    """Place an agent in quarantine (server-side messaging and request block)."""
    ok = tcp_server.registry.quarantine_agent(agent_id)
    if not ok:
        return {"success": False, "error": f"Agent '{agent_id}' not found"}
    return {"success": True, "agent_id": agent_id, "quarantined": True}


@app.post("/api/agents/{agent_id}/release")
def release_agent_endpoint(agent_id: str):
    """Release a previously quarantined agent."""
    ok = tcp_server.registry.release_agent(agent_id)
    if not ok:
        return {"success": False, "error": f"Agent '{agent_id}' not found"}
    return {"success": True, "agent_id": agent_id, "quarantined": False}


class QuarantinePolicyUpdate(BaseModel):
    enabled: bool = None
    cooldown_seconds: float = None
    whitelist_ips: list[str] = None
    whitelist_agents: list[str] = None


@app.get("/api/quarantine/policy")
def get_quarantine_policy_endpoint():
    """Return auto-quarantine policy, active cooldowns, and whitelists."""
    return tcp_server.registry.get_quarantine_policy()


@app.post("/api/quarantine/policy")
def update_quarantine_policy_endpoint(req: QuarantinePolicyUpdate):
    """Update auto-quarantine configuration."""
    return tcp_server.registry.update_quarantine_policy(
        enabled=req.enabled,
        cooldown_seconds=req.cooldown_seconds,
        whitelist_ips=req.whitelist_ips,
        whitelist_agents=req.whitelist_agents,
    )


@app.get("/api/events")
def get_security_events(limit: int = 50):
    """Security events from the detection engine."""
    with _events_lock:
        events = list(_recent_events[:limit])
    return {
        "events": events,
        "total": len(_recent_events),
        "detection_mode": detection_engine.get_status()["mode"],
    }


@app.get("/api/flows")
def get_flows():
    """Active network flows."""
    flows = flow_analyzer.get_active_flows()
    return {
        "flows": flows[:50],  # limit response size
        "total": len(flows),
    }


@app.get("/api/interfaces")
def get_interfaces():
    """Available network interfaces for packet capture."""
    return {
        "interfaces": packet_capture.get_interfaces(),
        "current": packet_capture.interface or None,
        "tshark_available": packet_capture.available,
    }


@app.post("/api/monitoring/start")
def start_monitoring(interface: str = None):
    """Start packet capture and monitoring."""
    if not packet_capture.available:
        return {
            "success": False,
            "error": "Packet capture unavailable",
            "reason": packet_capture.unavailable_reason,
        }

    iface = interface or packet_capture.interface or CAPTURE_INTERFACE
    if not iface:
        return {
            "success": False,
            "error": "No capture interface specified",
            "reason": "Set NETSHIELD_CAPTURE_INTERFACE environment variable or provide interface parameter.",
        }

    started = packet_capture.start(iface)
    if started:
        metrics_collector.start_monitoring()
        return {"success": True, "interface": iface}
    else:
        return {
            "success": False,
            "error": "Failed to start capture",
            "reason": packet_capture.unavailable_reason,
        }


@app.post("/api/monitoring/stop")
def stop_monitoring():
    """Stop packet capture and monitoring."""
    packet_capture.stop()
    metrics_collector.stop_monitoring()
    return {"success": True}


@app.post("/api/simulate/traffic")
def simulate_traffic(scenario: str = "normal", count: int = 50, source_ip: str = "192.168.1.105"):
    """
    Controlled traffic generator endpoint for demonstration and verification.
    Injects synthetic packet streams through the real FlowAnalyzer and DetectionEngine.
    """
    now = time.time()
    generated = 0
    metrics_collector.start_monitoring()

    if scenario == "port_scan":
        # Scan 25 unique destination ports to trigger PORT_SCAN_LIKE rule (> 15)
        for port in range(20, 46):
            pkt = {
                "timestamp": now,
                "source_ip": source_ip,
                "destination_ip": get_local_ip(),
                "source_port": 54321,
                "destination_port": port,
                "protocol": "TCP",
                "length": 64,
                "tcp_flags": "0x0002",
                "protocols_str": "eth:ip:tcp",
            }
            on_packet(pkt)
            generated += 1

    elif scenario == "traffic_spike":
        # Send 550 packets in a burst to trigger TRAFFIC_SPIKE rule (> 500 pkt/s)
        for i in range(550):
            pkt = {
                "timestamp": now,
                "source_ip": source_ip,
                "destination_ip": get_local_ip(),
                "source_port": 40000 + (i % 100),
                "destination_port": 80,
                "protocol": "TCP",
                "length": 1420,
                "tcp_flags": "0x0010",
                "protocols_str": "eth:ip:tcp",
            }
            on_packet(pkt)
            generated += 1

    elif scenario == "connection_burst":
        # Send 60 SYN packets rapidly to trigger CONNECTION_BURST rule (> 50 conn/s)
        for i in range(60):
            pkt = {
                "timestamp": now,
                "source_ip": source_ip,
                "destination_ip": get_local_ip(),
                "source_port": 30000 + i,
                "destination_port": 443,
                "protocol": "TCP",
                "length": 64,
                "tcp_flags": "0x0002",
                "protocols_str": "eth:ip:tcp",
            }
            on_packet(pkt)
            generated += 1

    else:
        # Normal mixed traffic (TCP, UDP, ICMP)
        import random
        for i in range(count):
            proto = random.choice(["TCP", "UDP", "ICMP"])
            dport = random.choice([80, 443, 53, 123])
            pkt = {
                "timestamp": now + (i * 0.05),
                "source_ip": source_ip,
                "destination_ip": get_local_ip(),
                "source_port": 50000 + (i % 50),
                "destination_port": dport,
                "protocol": proto,
                "length": random.randint(64, 1500),
                "tcp_flags": "0x0018" if proto == "TCP" else "",
                "protocols_str": f"eth:ip:{proto.lower()}",
            }
            on_packet(pkt)
            generated += 1

    # Force immediate detection analysis after synthetic injection
    detection_engine.force_analysis()

    with _events_lock:
        current_events = list(_recent_events[:5])

    return {
        "success": True,
        "scenario": scenario,
        "packets_generated": generated,
        "source_ip": source_ip,
        "recent_events": current_events,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


@app.post("/api/events/clear")
def clear_security_events():
    """Clear all security events from memory and database."""
    global _recent_events
    with _events_lock:
        _recent_events.clear()
    clear_events()
    return {"success": True, "message": "All security events cleared"}


@app.get("/api/detection/model")
def get_model_info():
    """Get metadata about the loaded ML NIDS model."""
    if detection_engine.ml_detector:
        return detection_engine.ml_detector.get_info()
    return {
        "name": "None",
        "loaded": False,
        "accuracy": 0.0,
        "classes": [],
        "feature_names": [],
        "feature_importances": {},
        "estimators": 0,
    }


# ════════════════════════════════════════
#  PHASE 2: AGENT CONTROLS & TEST LAB
# ════════════════════════════════════════

from pydantic import BaseModel, Field, field_validator
from networking.client import NetShieldClient

_local_agent = None
_agent_lock = threading.Lock()


class TestMessageRequest(BaseModel):
    message: str = Field(default="NETSHIELD_PROBE", max_length=256)


class AgentConnectRequest(BaseModel):
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(default=5000, ge=1, le=65535)

    @field_validator("host")
    @classmethod
    def validate_host(cls, value: str) -> str:
        value = value.strip()
        if not value or any(char.isspace() for char in value):
            raise ValueError("Enter a valid IP address or hostname without spaces.")
        return value


class CustomTrafficRequest(BaseModel):
    mode: str = Field(default="detection_test")
    protocol: str = Field(default="TCP")
    source_ip: str = Field(default="192.168.1.105")
    destination_port: int = Field(default=80, ge=1, le=65535)
    packet_count: int = Field(default=25, ge=1, le=500)
    tcp_flags: list[str] = Field(default=["SYN"])
    payload: str = Field(default="PROBE_PACKET", max_length=512)


@app.post("/api/devices/agent/connect")
def connect_agent(request: AgentConnectRequest | None = None):
    """
    Connect a local test agent instance to port 5000 for local testing and demonstration.
    """
    global _local_agent
    with _agent_lock:
        state = tcp_server.get_remote_state()
        if state.get("status") == "connected":
            return {
                "success": True,
                "message": "An agent is already connected.",
                "status": "connected",
                "hostname": state.get("hostname"),
                "ip": state.get("ip"),
            }

        if _local_agent:
            _local_agent.disconnect()
            _local_agent = None

        target_host = request.host if request else "127.0.0.1"
        target_port = request.port if request else SERVER_PORT
        _local_agent = NetShieldClient(host=target_host, port=target_port)
        _local_agent.connect()

    for _ in range(15):
        time.sleep(0.1)
        st = tcp_server.get_remote_state()
        if st.get("status") == "connected":
            return {
                "success": True,
                "message": f"Agent connected successfully to {target_host}:{target_port}.",
                "status": "connected",
                "hostname": st.get("hostname"),
                "ip": st.get("ip"),
            }

    err = _local_agent.error_msg if _local_agent else "Connection timed out."
    if "refused" in err.lower():
        error = "Connection refused; check whether the server is running."
    elif "timed out" in err.lower() or "timeout" in err.lower():
        error = "Connection timed out; check network connectivity and firewall rules."
    else:
        error = f"Unable to connect: {err}"
    return {
        "success": False,
        "error": error,
        "status": "disconnected",
    }


@app.post("/api/devices/agent/disconnect")
def disconnect_agent():
    """
    Disconnect active agent cleanly from the server.
    """
    global _local_agent
    with _agent_lock:
        if _local_agent:
            _local_agent.disconnect()
            _local_agent = None
        tcp_server.disconnect_client()
    return {
        "success": True,
        "message": "Agent disconnected.",
        "status": "disconnected",
    }


@app.post("/api/devices/agent/message")
def test_agent_message(req: TestMessageRequest):
    """
    Send a test message through the real TCP socket channel and measure monotonic RTT.
    """
    return tcp_server.send_test_message(req.message, timeout=3.0)


@app.post("/api/simulate/custom")
def simulate_custom_traffic(req: CustomTrafficRequest):
    """
    Custom Traffic Lab:
    Mode 1 (detection_test): Routes synthesized packets through FlowAnalyzer and DetectionEngine.
    Mode 2 (network_test): Sends verified message frame over real TCP socket channel to connected agent.
    """
    if req.mode == "network_test":
        state = tcp_server.get_remote_state()
        if state.get("status") != "connected":
            return {
                "success": False,
                "mode": "network_test",
                "error": "Real network test requires an active connected agent on Computer A (or local test agent). Connect agent first.",
            }
        res = tcp_server.send_test_message(f"NET_TEST:{req.payload}", timeout=3.0)
        return {
            "success": res.get("success", False),
            "mode": "network_test",
            "protocol": "TCP",
            "destination_port": req.destination_port,
            "message": f"Real frame delivered to {res.get('recipient')}",
            "ack": res.get("ack_content"),
            "rtt_ms": res.get("rtt_ms"),
            "timestamp": res.get("timestamp"),
            "threat_detected": False,
            "error": res.get("error"),
            "note": "Real network communication verified over active TCP socket. No synthetic substitutions.",
        }

    # Mode 1: detection_test
    ip_parts = req.source_ip.strip().split(".")
    if len(ip_parts) != 4 or not all(p.isdigit() and 0 <= int(p) <= 255 for p in ip_parts):
        return {
            "success": False,
            "mode": "detection_test",
            "error": f"Invalid source IPv4 address: '{req.source_ip}'",
        }

    proto = req.protocol.upper()
    if proto not in ("TCP", "UDP", "ICMP"):
        return {
            "success": False,
            "mode": "detection_test",
            "error": f"Unsupported protocol: '{req.protocol}'. Must be TCP, UDP, or ICMP.",
        }

    now = time.time()
    hex_flags = "0x0002" if "SYN" in req.tcp_flags else "0x0010"

    with _events_lock:
        start_event_count = len(_recent_events)

    metrics_collector.start_monitoring()

    is_scan_test = "SYN" in req.tcp_flags and req.packet_count >= 15
    for i in range(req.packet_count):
        dport = (req.destination_port + i) if is_scan_test else req.destination_port
        pkt = {
            "timestamp": now + (i * 0.02),
            "source_ip": req.source_ip,
            "destination_ip": get_local_ip(),
            "source_port": 50000 + (i % 50),
            "destination_port": dport,
            "protocol": proto,
            "length": max(64, min(1500, len(req.payload.encode()) + 64)),
            "tcp_flags": hex_flags if proto == "TCP" else "",
            "protocols_str": f"eth:ip:{proto.lower()}",
        }
        on_packet(pkt)

    detection_engine.force_analysis()

    with _events_lock:
        new_events = list(_recent_events[:max(1, len(_recent_events) - start_event_count)]) if len(_recent_events) > start_event_count else []

    threat = len(new_events) > 0
    return {
        "success": True,
        "mode": "detection_test",
        "protocol": proto,
        "packets_evaluated": req.packet_count,
        "source_ip": req.source_ip,
        "destination_port": req.destination_port,
        "threat_detected": threat,
        "events_triggered": new_events,
        "ml_model": detection_engine.ml_model_name,
        "verdict": "THREAT DETECTED" if threat else "BENIGN / NORMAL",
        "summary": f"Injected {req.packet_count} {proto} packets through FlowAnalyzer and DetectionEngine ({detection_engine.ml_model_name or 'Heuristic'}).",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


# ── Run directly ──
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT)
