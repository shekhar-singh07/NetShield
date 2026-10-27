"""
NetShield-ML — Agent Client & In-Memory Messaging State (Computer A)
===================================================================
Maintains a persistent TCP socket connection to Computer B (NetShield Server).
Handles registration with pairing code, automatic exponential backoff reconnection,
peer list discovery, session handshakes, and chat messaging with a 200-message buffer.
"""
import json
import logging
import os
import socket
import threading
import time
from collections import deque
from datetime import datetime

logger = logging.getLogger("netshield.agent_client")


class AgentClient:
    """
    Manages persistent connection to NetShield TCP server and local messaging state.
    Thread-safe.
    """

    def __init__(
        self,
        server_host: str = "127.0.0.1",
        server_port: int = 5000,
        pairing_code: str = "",
        agent_name: str = "Agent",
        config_file: str = "agent_config.json",
        auto_connect: bool = True,
    ):
        self.config_file = config_file
        self._lock = threading.Lock()

        # Load persisted config if file exists and parameters are defaults
        self._load_config(server_host, server_port, pairing_code, agent_name)

        # Connection state
        self._socket = None
        self._running = False
        self._rx_thread = None
        self._hb_thread = None
        self._reconnect_thread = None
        self._status = "disconnected"  # connected | connecting | disconnected
        self._error_msg = None
        self._sequence = 0
        self._last_rtt_ms = None
        self._last_heartbeat = None
        self._connected_since = None

        # Multi-agent state
        self.agent_id = None
        self.quarantined = False
        self.quarantine_notice = None
        self.peers = {}  # agent_id -> {agent_id, name, status, session_status}
        self.incoming_requests = []  # [{from_agent_id, from_name, timestamp}]
        self.active_sessions = set()  # set of peer agent_id strings
        self.conversations = {}  # peer_id -> deque(maxlen=200) of message dicts
        self.system_notices = deque(maxlen=50)

        if auto_connect:
            self.start()

    def _load_config(self, host, port, code, name):
        """Load configuration from disk if available, with fallbacks."""
        cfg = {}
        if self.config_file and os.path.isfile(self.config_file):
            try:
                if os.path.getsize(self.config_file) > 0:
                    with open(self.config_file, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read {self.config_file}: {e}")

        self.server_host = (host if host != "127.0.0.1" and host else cfg.get("server_host", host)) or "127.0.0.1"
        self.server_port = int(port or cfg.get("server_port", 5000))
        self.pairing_code = str(code or cfg.get("pairing_code", "")).strip()
        self.agent_name = str(name if name != "Agent" and name else cfg.get("agent_name", name) or "Agent").strip()

    def save_config(self):
        """Persist current connection configuration to disk."""
        if not self.config_file:
            return
        data = {
            "server_host": self.server_host,
            "server_port": self.server_port,
            "pairing_code": self.pairing_code,
            "agent_name": self.agent_name,
        }
        try:
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            logger.info(f"Saved agent config to {self.config_file}")
        except Exception as e:
            logger.error(f"Failed to save config to {self.config_file}: {e}")

    def update_settings(self, host: str, port: int, pairing_code: str, name: str):
        """Update connection settings and persist to config file."""
        with self._lock:
            self.server_host = host.strip() if host else self.server_host
            self.server_port = int(port) if port else self.server_port
            self.pairing_code = pairing_code.strip() if pairing_code is not None else self.pairing_code
            self.agent_name = name.strip() if name else self.agent_name
        self.save_config()
        self.reconnect()

    def start(self):
        """Start the persistent client and background supervisor."""
        if self._running:
            return
        self._running = True
        self._status = "connecting"
        self._reconnect_thread = threading.Thread(target=self._connection_supervisor, daemon=True)
        self._reconnect_thread.start()

    def stop(self):
        """Stop connection supervisor and disconnect socket."""
        self._running = False
        self._disconnect_socket()
        with self._lock:
            self._status = "disconnected"
            self.agent_id = None

    def reconnect(self):
        """Trigger an immediate reconnection attempt."""
        self._disconnect_socket()
        with self._lock:
            self._status = "connecting"
            self._error_msg = None

    def _disconnect_socket(self):
        """Close socket safely."""
        sock = self._socket
        self._socket = None
        if sock:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                sock.close()
            except Exception:
                pass

    def _connection_supervisor(self):
        """Supervisor loop managing persistent connection and exponential backoff."""
        backoff = 1.0
        max_backoff = 15.0

        while self._running:
            connected = self._connect_and_run()
            if not self._running:
                break

            with self._lock:
                self._status = "connecting"

            # Sleep with exponential backoff between reconnect attempts
            logger.info(f"Reconnecting to {self.server_host}:{self.server_port} in {backoff:.1f}s...")
            time.sleep(backoff)
            backoff = min(backoff * 1.5, max_backoff)

    def _connect_and_run(self) -> bool:
        """Connect to TCP server, register, and handle incoming messages until disconnected."""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(6.0)
            sock.connect((self.server_host, self.server_port))
            sock.settimeout(None)  # Blocking mode for rx thread
            self._socket = sock

            # Send registration envelope
            reg_payload = {
                "type": "register",
                "agent_name": self.agent_name,
                "pairing_code": self.pairing_code,
            }
            self._send_payload(reg_payload)

            # Start heartbeat sender loop
            self._hb_thread = threading.Thread(target=self._heartbeat_loop, args=(sock,), daemon=True)
            self._hb_thread.start()

            # Continuous receiver loop
            buffer = ""
            while self._running and self._socket is sock:
                try:
                    data = sock.recv(4096)
                except Exception:
                    break

                if not data:
                    break

                buffer += data.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    self._handle_server_message(msg)

            return True

        except (ConnectionRefusedError, socket.gaierror) as e:
            with self._lock:
                self._error_msg = f"Cannot reach server {self.server_host}:{self.server_port}"
                self._status = "disconnected"
            return False
        except Exception as e:
            with self._lock:
                self._error_msg = str(e)
                self._status = "disconnected"
            return False
        finally:
            self._disconnect_socket()
            with self._lock:
                if self._status == "connected":
                    self._status = "disconnected"

    def _send_payload(self, data: dict) -> bool:
        """Send a JSON envelope ending with newline."""
        try:
            line = json.dumps(data) + "\n"
            sock = self._socket
            if sock:
                sock.sendall(line.encode("utf-8"))
                return True
        except Exception as e:
            logger.debug(f"Failed to send to server: {e}")
        return False

    def _heartbeat_loop(self, sock: socket.socket):
        """Send periodic heartbeat frames every 3 seconds to measure RTT."""
        while self._running and self._socket is sock:
            time.sleep(3.0)
            if self._socket is not sock:
                break
            self._sequence += 1
            hb = {
                "type": "heartbeat",
                "hostname": socket.gethostname(),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "sequence": self._sequence,
                "send_time": time.time(),
            }
            if not self._send_payload(hb):
                break

    # ─────────────────────────────────────────────────────────────
    #  Server Message Dispatcher
    # ─────────────────────────────────────────────────────────────

    def _handle_server_message(self, msg: dict):
        """Process incoming messages from the NetShield server."""
        msg_type = msg.get("type", "")

        if msg_type == "register_ack":
            success = msg.get("success", False)
            with self._lock:
                if success:
                    self._status = "connected"
                    self.agent_id = msg.get("agent_id")
                    self._connected_since = time.strftime("%Y-%m-%dT%H:%M:%S")
                    self._error_msg = None
                    logger.info(f"Registered as agent '{self.agent_id}'")
                    # Request initial peer list
                    self._send_payload({"type": "peer_list_request"})
                else:
                    self._status = "disconnected"
                    self._error_msg = msg.get("error", "Registration rejected (Check pairing code)")
                    logger.warning(f"Registration failed: {self._error_msg}")

        elif msg_type == "peer_list":
            raw_peers = msg.get("peers", [])
            with self._lock:
                updated = {}
                for p in raw_peers:
                    pid = p.get("agent_id")
                    if pid == self.agent_id:
                        continue  # don't list self
                    # Retain existing session relationship
                    prev_session = self.peers.get(pid, {}).get("session_status", "none")
                    if pid in self.active_sessions:
                        prev_session = "connected"
                    updated[pid] = {
                        "agent_id": pid,
                        "name": p.get("name", pid),
                        "status": p.get("status", "offline"),
                        "session_status": prev_session,
                    }
                self.peers = updated

        elif msg_type in ("incoming_request", "connect_request"):
            from_id = msg.get("from_agent_id")
            from_name = msg.get("from_name", from_id)
            if from_id:
                with self._lock:
                    # Avoid duplicate request entries
                    self.incoming_requests = [
                        r for r in self.incoming_requests if r["from_agent_id"] != from_id
                    ]
                    self.incoming_requests.append({
                        "from_agent_id": from_id,
                        "from_name": from_name,
                        "timestamp": datetime.now().strftime("%H:%M:%S"),
                    })
                    if from_id in self.peers:
                        self.peers[from_id]["session_status"] = "pending_received"
                logger.info(f"Incoming connection request from {from_name} ({from_id})")

        elif msg_type == "connect_accepted":
            peer_id = msg.get("peer_id")
            peer_name = msg.get("peer_name", peer_id)
            with self._lock:
                if peer_id:
                    self.active_sessions.add(peer_id)
                    if peer_id in self.peers:
                        self.peers[peer_id]["session_status"] = "connected"
                    self.incoming_requests = [
                        r for r in self.incoming_requests if r["from_agent_id"] != peer_id
                    ]
            logger.info(f"Session established with {peer_name} ({peer_id})")

        elif msg_type == "connect_declined":
            peer_id = msg.get("peer_id")
            reason = msg.get("reason", "Declined")
            with self._lock:
                if peer_id:
                    self.active_sessions.discard(peer_id)
                    if peer_id in self.peers:
                        self.peers[peer_id]["session_status"] = "declined"
            logger.info(f"Session declined by {peer_id}: {reason}")

        elif msg_type == "connect_error":
            to_id = msg.get("to_agent_id")
            reason = msg.get("reason", "Error")
            with self._lock:
                if to_id in self.peers:
                    self.peers[to_id]["session_status"] = "none"
                self.system_notices.append({
                    "time": time.strftime("%H:%M:%S"),
                    "text": f"Connection to {to_id} failed: {reason}",
                })

        elif msg_type == "chat_message":
            msg_id = msg.get("id")
            from_id = msg.get("from_agent_id")
            from_name = msg.get("from_name", from_id)
            content = msg.get("content", "")
            ts = msg.get("timestamp") or datetime.now().isoformat()

            if from_id:
                with self._lock:
                    if from_id not in self.conversations:
                        self.conversations[from_id] = deque(maxlen=200)
                    self.conversations[from_id].append({
                        "id": msg_id,
                        "from": from_id,
                        "from_name": from_name,
                        "to": self.agent_id,
                        "text": content,
                        "timestamp": ts,
                        "status": "delivered",
                    })

                # Acknowledge delivery back to server
                if msg_id is not None:
                    self._send_payload({
                        "type": "delivery_ack",
                        "id": msg_id,
                        "from_agent_id": self.agent_id,
                    })

        elif msg_type in ("chat_message_ack", "delivery_update"):
            msg_id = msg.get("id")
            status = msg.get("status", "delivered")
            with self._lock:
                matched = False
                for peer_id, msgs in self.conversations.items():
                    for m in msgs:
                        if m.get("id") == msg_id:
                            m["status"] = status
                            matched = True
                            break
                    if matched:
                        break

                # If no message with this id was found, match the latest sent message with id=None
                if not matched:
                    for peer_id, msgs in self.conversations.items():
                        for m in reversed(msgs):
                            if m.get("id") is None and m.get("status") == "sent":
                                m["id"] = msg_id
                                m["status"] = status
                                matched = True
                                break
                        if matched:
                            break

        elif msg_type == "probe":
            # Echo real ACK back to server
            probe_id = msg.get("id")
            ack = {
                "type": "probe_ack",
                "id": probe_id,
                "echo": msg.get("content"),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "hostname": socket.gethostname(),
            }
            self._send_payload(ack)

        elif msg_type == "heartbeat_ack":
            rtt = msg.get("rtt_ms")
            if rtt is not None:
                self._last_rtt_ms = rtt
            self._last_heartbeat = time.strftime("%Y-%m-%dT%H:%M:%S")

        elif msg_type == "system_notice":
            text = msg.get("message", "System notice")
            code = msg.get("code")
            with self._lock:
                if code in ("QUARANTINED", "AUTO_QUARANTINED"):
                    self.quarantined = True
                    self.quarantine_notice = text
                elif code == "RELEASED":
                    self.quarantined = False
                    self.quarantine_notice = None
                self.system_notices.append({
                    "time": time.strftime("%H:%M:%S"),
                    "text": text,
                    "code": code,
                })
            logger.info(f"System notice from server: {text} ({code})")

        elif msg_type == "error":
            logger.warning(f"Server error: {msg.get('message')}")
            with self._lock:
                self.system_notices.append({
                    "time": time.strftime("%H:%M:%S"),
                    "text": msg.get("message", "Server error"),
                })

    # ─────────────────────────────────────────────────────────────
    #  Actions for REST API
    # ─────────────────────────────────────────────────────────────

    def send_connect_request(self, to_agent_id: str) -> dict:
        """Initiate session handshake with a peer."""
        with self._lock:
            if not self.agent_id or self._status != "connected":
                return {"success": False, "error": "Agent is not connected to server."}
            if to_agent_id in self.peers:
                self.peers[to_agent_id]["session_status"] = "pending_sent"

        ok = self._send_payload({
            "type": "connect_request",
            "to_agent_id": to_agent_id,
        })
        return {"success": ok, "message": f"Connection request sent to {to_agent_id}"}

    def respond_connect_request(self, from_agent_id: str, accept: bool, reason: str = "") -> dict:
        """Accept or decline an incoming connection request."""
        with self._lock:
            self.incoming_requests = [
                r for r in self.incoming_requests if r["from_agent_id"] != from_agent_id
            ]

        if accept:
            with self._lock:
                self.active_sessions.add(from_agent_id)
                if from_agent_id in self.peers:
                    self.peers[from_agent_id]["session_status"] = "connected"

            ok = self._send_payload({
                "type": "connect_accept",
                "from_agent_id": from_agent_id,
            })
            return {"success": ok, "message": f"Accepted connection from {from_agent_id}"}
        else:
            with self._lock:
                self.active_sessions.discard(from_agent_id)
                if from_agent_id in self.peers:
                    self.peers[from_agent_id]["session_status"] = "declined"

            ok = self._send_payload({
                "type": "connect_decline",
                "from_agent_id": from_agent_id,
                "reason": reason or "Declined by user",
            })
            return {"success": ok, "message": f"Declined connection from {from_agent_id}"}

    def send_chat(self, to_agent_id: str, text: str) -> dict:
        """Send a chat message to a peer (requires active session)."""
        content = str(text or "").strip()
        if not content:
            return {"success": False, "error": "Message content cannot be empty."}

        with self._lock:
            if not self.agent_id or self._status != "connected":
                return {"success": False, "error": "Agent is not connected to server."}
            if to_agent_id not in self.active_sessions:
                return {
                    "success": False,
                    "error": f"No active session with {to_agent_id}. Send a connection request first.",
                }

            ts = datetime.now().isoformat()
            # Optimistically append to local conversation
            if to_agent_id not in self.conversations:
                self.conversations[to_agent_id] = deque(maxlen=200)

            msg_entry = {
                "id": None,
                "from": self.agent_id,
                "from_name": self.agent_name,
                "to": to_agent_id,
                "text": content,
                "timestamp": ts,
                "status": "sent",
            }
            self.conversations[to_agent_id].append(msg_entry)

        ok = self._send_payload({
            "type": "chat_message",
            "to_agent_id": to_agent_id,
            "content": content,
        })
        if not ok:
            msg_entry["status"] = "failed"
            return {"success": False, "error": "Socket transmission failed."}

        return {"success": True, "message": "Message sent."}

    def get_state(self) -> dict:
        """Return the current in-memory state for HTTP polling."""
        with self._lock:
            conv_serializable = {
                peer: list(msgs) for peer, msgs in self.conversations.items()
            }
            return {
                "agent_id": self.agent_id,
                "agent_name": self.agent_name,
                "status": self._status,
                "connected": self._status == "connected",
                "server_host": self.server_host,
                "server_port": self.server_port,
                "pairing_code": self.pairing_code,
                "last_rtt_ms": self._last_rtt_ms,
                "last_heartbeat": self._last_heartbeat,
                "connected_since": self._connected_since,
                "error": self._error_msg,
                "peers": list(self.peers.values()),
                "incoming_requests": list(self.incoming_requests),
                "active_sessions": list(self.active_sessions),
                "conversations": conv_serializable,
                "system_notices": list(self.system_notices),
                "quarantined": self.quarantined,
                "quarantine_notice": self.quarantine_notice,
            }
