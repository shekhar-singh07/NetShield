"""
NetShield-ML — Agent Server (Computer A)
=========================================
Lightweight standalone FastAPI REST server that the agent machine runs.
Exposes all agent state to the local React UI at http://localhost:5174.

Run on Computer A:
    cd NetShield
    python agent/agent_server.py

Then open the React UI on Computer A and choose "Run as Agent."
The UI connects to this server (http://localhost:7001) for all agent controls.
"""
import os
import sys
import time
import socket
import threading
import logging

# Ensure parent directory is on path for .env loading
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Lazy-load dotenv
def _load_dotenv():
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        ".env",
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip("'\"")
                            if k not in os.environ:
                                os.environ[k] = v
                break
            except Exception:
                pass

_load_dotenv()

try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    import uvicorn
except ImportError:
    print("ERROR: FastAPI/uvicorn not installed.")
    print("Run: pip install fastapi uvicorn")
    sys.exit(1)

# Import the existing agent implementation
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from traffic_generator import (
    NetShieldAgent,
    run_port_scan,
    run_traffic_spike,
    run_connection_burst,
)
try:
    from agent.agent_client import AgentClient
except ImportError:
    from agent_client import AgentClient

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("netshield.agent_server")

# ── Agent instances ──
_default_host = os.getenv("REMOTE_HOST", os.getenv("SERVER_HOST", ""))
_default_port = int(os.getenv("REMOTE_PORT", os.getenv("SERVER_PORT", "5000")))
_config_file = os.getenv("AGENT_CONFIG_FILE", "agent_config.json")
_pairing_code = os.getenv("AGENT_PAIRING_CODE", "")
_agent_name = os.getenv("AGENT_NAME", "Agent")

_agent: NetShieldAgent = NetShieldAgent(
    host=_default_host or "127.0.0.1",
    port=_default_port,
)
_client: AgentClient = AgentClient(
    server_host=_default_host or "127.0.0.1",
    server_port=_default_port,
    pairing_code=_pairing_code,
    agent_name=_agent_name,
    config_file=_config_file,
    auto_connect=True,
)
_agent_lock = threading.Lock()

# ── FastAPI App ──
app = FastAPI(
    title="NetShield Agent API",
    description="Local agent control API for Computer A",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ──
class ConnectRequest(BaseModel):
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(default=5000, ge=1, le=65535)


class SimulateRequest(BaseModel):
    attack_type: str = Field(default="port_scan")  # port_scan | traffic_spike | connection_burst | normal
    target_host: str = Field(default="")
    port_range_start: int = Field(default=20, ge=1, le=65534)
    port_range_end: int = Field(default=80, ge=2, le=65535)
    packet_count: int = Field(default=600, ge=1, le=5000)
    burst_duration: float = Field(default=2.0, ge=0.5, le=10.0)


class PeerConnectReq(BaseModel):
    to: str = Field(min_length=1)


class PeerRespondReq(BaseModel):
    from_agent: str = Field(alias="from", min_length=1)
    accept: bool = True
    reason: str = ""

    class Config:
        populate_by_name = True


class SendChatReq(BaseModel):
    to: str = Field(min_length=1)
    text: str = Field(min_length=1)


class UpdateSettingsReq(BaseModel):
    host: str = ""
    port: int = 5000
    pairing_code: str = ""
    name: str = ""


# ── Helper ──
def _get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _agent_status() -> dict:
    """Return a clean JSON-safe status payload from the agent."""
    with _agent_lock:
        a = _agent
        try:
            payload = a.status_payload()
        except Exception:
            payload = {}

    return {
        "status": payload.get("status", "disconnected"),
        "connected": payload.get("connected", False),
        "server_host": payload.get("server", a.host),
        "server_port": payload.get("port", a.port),
        "hostname": socket.gethostname(),
        "local_ip": _get_local_ip(),
        "heartbeat_count": payload.get("heartbeat_count", 0),
        "last_rtt_ms": payload.get("last_rtt_ms"),
        "server_hostname": payload.get("server_hostname"),
        "connected_since": payload.get("connected_since"),
        "last_heartbeat": payload.get("last_heartbeat"),
        "recent_events": payload.get("recent_events", []),
        "error": payload.get("error"),
    }


# ─────────────────────────────────
#  API Routes — Multi-Agent & Chat
# ─────────────────────────────────

@app.get("/agent/state")
@app.get("/api/agent/state")
def get_agent_state():
    """Return in-memory multi-agent state (peers, sessions, conversations)."""
    return _client.get_state()


@app.post("/agent/connect-request")
@app.post("/api/agent/connect-request")
def agent_connect_request(req: PeerConnectReq):
    """Initiate session handshake with peer."""
    return _client.send_connect_request(req.to)


@app.post("/agent/respond")
@app.post("/api/agent/respond")
def agent_respond(req: PeerRespondReq):
    """Accept or decline an incoming connection request."""
    return _client.respond_connect_request(req.from_agent, req.accept, req.reason)


@app.post("/agent/send")
@app.post("/api/agent/send")
def agent_send(req: SendChatReq):
    """Send a chat message to an active session peer."""
    return _client.send_chat(req.to, req.text)


@app.post("/agent/reconnect")
@app.post("/api/agent/reconnect")
def agent_reconnect():
    """Trigger immediate reconnection to the NetShield server."""
    _client.reconnect()
    return {"success": True, "message": "Reconnecting...", **_client.get_state()}


@app.post("/agent/settings")
@app.post("/api/agent/settings")
def agent_update_settings(req: UpdateSettingsReq):
    """Update connection settings, persist to config, and reconnect."""
    _client.update_settings(req.host, req.port, req.pairing_code, req.name)
    return {"success": True, "message": "Settings updated.", **_client.get_state()}


# ─────────────────────────────────
#  API Routes — Legacy Agent & Simulation
# ─────────────────────────────────

@app.get("/api/agent/status")
def get_status():
    """Return current agent status and connection info."""
    return _agent_status()


@app.post("/api/agent/connect")
def connect(req: ConnectRequest):
    """Connect the agent to a NetShield server."""
    global _agent
    with _agent_lock:
        # Disconnect any existing connection
        try:
            if _agent.running:
                _agent.disconnect()
                time.sleep(0.4)
        except Exception:
            pass

        _agent = NetShieldAgent(host=req.host.strip(), port=req.port)
        _agent.connect()

    # Wait up to 3s for connection
    for _ in range(30):
        time.sleep(0.1)
        try:
            p = _agent.status_payload()
            if p.get("connected") or p.get("status") == "connected":
                logger.info(f"Agent connected to {req.host}:{req.port}")
                return {
                    "success": True,
                    "message": f"Connected to {req.host}:{req.port}",
                    **_agent_status(),
                }
        except Exception:
            pass

    # Return current state even if not yet connected
    st = _agent_status()
    if st.get("error"):
        return {
            "success": False,
            "error": st["error"],
            **st,
        }
    return {
        "success": False,
        "error": f"Could not connect to {req.host}:{req.port}. Check that the server is running and reachable.",
        **st,
    }


@app.post("/api/agent/disconnect")
def disconnect():
    """Disconnect the agent from the server."""
    with _agent_lock:
        try:
            _agent.disconnect()
        except Exception as e:
            logger.warning(f"Disconnect error: {e}")
    return {
        "success": True,
        "message": "Disconnected.",
        **_agent_status(),
    }


@app.post("/api/agent/test")
def send_test():
    """Send a test message to the server and report the result."""
    with _agent_lock:
        try:
            ok = _agent.send_test_message()
        except Exception as e:
            return {"success": False, "error": str(e), **_agent_status()}
    return {
        "success": bool(ok),
        "message": "Test message sent." if ok else "Test message failed — is the agent connected?",
        **_agent_status(),
    }


@app.post("/api/agent/simulate")
def simulate_attack(req: SimulateRequest):
    """
    Trigger a network attack simulation from this agent machine.
    Runs in a background thread so the API returns immediately.
    """
    target = (
        req.target_host.strip()
        or getattr(_client, "server_host", "")
        or getattr(_agent, "host", "")
        or "127.0.0.1"
    )

    def _run():
        try:
            if req.attack_type == "port_scan":
                run_port_scan(
                    target_ip=target,
                    start_port=req.port_range_start,
                    end_port=req.port_range_end,
                )
            elif req.attack_type == "traffic_spike":
                # Volumetric spike must exceed 500 pkts/s to trigger rule and ML detectors
                count = max(req.packet_count, 650)
                run_traffic_spike(
                    target_ip=target,
                    count=count,
                )
            elif req.attack_type == "connection_burst":
                # Connection burst must exceed 50 conn/s to trigger rule and ML detectors
                count = max(req.packet_count, 65)
                run_connection_burst(
                    target_ip=target,
                    count=count,
                )
            else:
                # Normal: just send a few harmless packets
                run_traffic_spike(target_ip=target, count=min(req.packet_count, 20))
        except Exception as e:
            logger.error(f"Simulation error ({req.attack_type}): {e}")

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {
        "success": True,
        "message": f"Simulation '{req.attack_type}' started against {target}.",
        "attack_type": req.attack_type,
        "target": target,
        **_agent_status(),
    }


@app.get("/api/agent/info")
def get_info():
    """System info for this agent machine."""
    return {
        "hostname": socket.gethostname(),
        "local_ip": _get_local_ip(),
        "agent_port": 7001,
        "platform": sys.platform,
    }


# ── Startup / Shutdown ──
@app.on_event("startup")
def startup():
    logger.info("NetShield Agent Server started on http://0.0.0.0:7001")
    logger.info(f"  Local IP: {_get_local_ip()}")
    logger.info(f"  Default server: {_default_host or '(not configured)'}:{_default_port}")


@app.on_event("shutdown")
def shutdown():
    try:
        _agent.disconnect()
    except Exception:
        pass
    try:
        _client.stop()
    except Exception:
        pass
    logger.info("NetShield Agent Server stopped")


# ── Entry point ──
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="NetShield Agent Server — Computer A (Multi-Agent & Attack Simulator)"
    )
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--ui-port", type=int, default=None, help="Agent UI / API port (default: 7001)")
    parser.add_argument("--port", type=int, default=7001, help="Alias for --ui-port (default: 7001)")
    parser.add_argument("--name", default=None, help="Agent name (e.g. 'Agent-A')")
    parser.add_argument(
        "--config-file",
        default=None,
        help="Path to JSON config file (default: agent_config.json)",
    )
    parser.add_argument("--pairing-code", default=None, help="Server pairing code")
    parser.add_argument("--server", default=None, help="NetShield server IP (Computer B)")
    parser.add_argument(
        "--server-port", type=int, default=None, help="Server TCP port (default: 5000)"
    )
    args = parser.parse_args()

    # Determine final UI port (--ui-port takes precedence over --port default)
    ui_port = args.ui_port if args.ui_port is not None else args.port

    # Reconfigure _client and _agent from CLI flags if supplied
    if args.config_file:
        _client.config_file = args.config_file
        _client._load_config(
            args.server or _client.server_host,
            args.server_port or _client.server_port,
            args.pairing_code if args.pairing_code is not None else _client.pairing_code,
            args.name or _client.agent_name,
        )
    if args.name:
        _client.agent_name = args.name
    if args.pairing_code is not None:
        _client.pairing_code = args.pairing_code
    if args.server:
        _agent.host = args.server
        _client.server_host = args.server
    if args.server_port:
        _agent.port = args.server_port
        _client.server_port = args.server_port

    _client.save_config()
    _client.reconnect()

    print(f"\n{'='*56}")
    print(f"  NetShield Agent Server: {_client.agent_name}")
    print(f"  UI / API: http://localhost:{ui_port} (bound to {args.host})")
    print(f"  Target Server: {_client.server_host}:{_client.server_port}")
    print(f"  Config File: {_client.config_file}")
    print(f"{'='*56}\n")

    uvicorn.run(app, host=args.host, port=ui_port, log_level="warning")
