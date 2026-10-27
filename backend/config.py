"""
NetShield-ML — Configuration
Sensible defaults for all configurable parameters.
Loads environment variables from .env if present.
"""
import os
import socket


def _load_dotenv():
    """Lightweight zero-dependency .env loader."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
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


def _get_setting(key: str, default: str, prefix: str = "NETSHIELD_") -> str:
    """Check standard key, then prefixed key, then default."""
    return os.getenv(key, os.getenv(f"{prefix}{key}", default))


# ── TCP Server (Computer B listens on this) ──
SERVER_HOST = _get_setting("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(_get_setting("SERVER_PORT", "5000"))

# ── Remote device defaults (Computer A connects to Computer B) ──
REMOTE_HOST = _get_setting("REMOTE_HOST", "127.0.0.1")
REMOTE_PORT = int(_get_setting("REMOTE_PORT", "5000"))

# ── Agent Pairing Code ──
import secrets as _secrets
_configured_code = _get_setting("AGENT_PAIRING_CODE", "")
if _configured_code:
    AGENT_PAIRING_CODE = _configured_code
else:
    AGENT_PAIRING_CODE = f"{_secrets.randbelow(900000) + 100000}"

# ── Packet capture ──
CAPTURE_INTERFACE = _get_setting("CAPTURE_INTERFACE", "")

# ── FastAPI ──
API_HOST = _get_setting("API_HOST", "0.0.0.0")
API_PORT = int(_get_setting("API_PORT", "8000"))

# ── Database ──
DATABASE_PATH = _get_setting("DATABASE_PATH", "netshield.db", prefix="NETSHIELD_DB_")

# ── Detection thresholds ──
DETECTION_PACKET_RATE_THRESHOLD = int(
    _get_setting("DETECTION_PKT_RATE", "500")
)
DETECTION_PORT_SCAN_THRESHOLD = int(
    _get_setting("DETECTION_PORT_SCAN", "15")
)
DETECTION_CONNECTION_BURST_THRESHOLD = int(
    _get_setting("DETECTION_CONN_BURST", "50")
)


def get_local_hostname():
    """Return the hostname of this machine."""
    try:
        return socket.gethostname()
    except Exception:
        return "unknown"


def get_local_ip():
    """Best-effort local IP address detection."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
