"""
NetShield-ML — TCP Server (Computer B)
Accepts connections from remote NetShield agents, handles HELLO/ACK,
heartbeat protocol, and bidirectional message/ACK testing over JSON messages.
"""
import socket
import threading
import json
import time
import logging

try:
    from backend.networking.multi_agent import MultiAgentRegistry
except ImportError:
    from networking.multi_agent import MultiAgentRegistry

logger = logging.getLogger("netshield.server")


class NetShieldServer:
    """TCP server that listens for remote NetShield agent connections."""

    def __init__(self, host: str = "0.0.0.0", port: int = 5000, on_packet=None, registry=None):
        self.host = host
        self.port = port
        self.on_packet = on_packet
        self.registry = registry or MultiAgentRegistry()
        self._running = False
        self._server_socket = None
        self._thread = None
        self._lock = threading.Lock()

        # Remote device state — exposed to the API
        self.remote_device = {
            "status": "disconnected",
            "hostname": None,
            "ip": None,
            "port": None,
            "rtt_ms": None,
            "last_heartbeat": None,
            "last_message": None,
            "connected_since": None,
        }
        self._client_socket = None
        self._pending_probes = {}  # req_id -> {"event": Event, "response": dict}

    def start(self):
        """Start the TCP server in a background thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info(f"TCP Server started on {self.host}:{self.port}")

    def stop(self):
        """Stop the TCP server."""
        self._running = False
        self.disconnect_client()
        if self._server_socket:
            try:
                self._server_socket.close()
            except Exception:
                pass
        with self._lock:
            self.remote_device = {
                "status": "disconnected",
                "hostname": None,
                "ip": None,
                "port": None,
                "rtt_ms": None,
                "last_heartbeat": None,
                "last_message": None,
                "connected_since": None,
            }
        logger.info("TCP Server stopped")

    def disconnect_client(self):
        """Gracefully disconnect the active client socket if one exists."""
        with self._lock:
            if self._client_socket:
                try:
                    self._client_socket.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self._client_socket.close()
                except Exception:
                    pass
                self._client_socket = None
            self.remote_device["status"] = "disconnected"
            self.remote_device["hostname"] = None

    def get_remote_state(self) -> dict:
        """Return current remote device state (thread-safe)."""
        with self._lock:
            return dict(self.remote_device)

    def send_test_message(self, message: str, timeout: float = 3.0) -> dict:
        """
        Send a test probe frame to the connected agent and await a real ACK.
        Measures precise round-trip time (RTT) via monotonic clock.
        """
        with self._lock:
            client = self._client_socket
            if not client or self.remote_device.get("status") != "connected":
                return {
                    "success": False,
                    "error": "No agent connected. Start Computer A client first.",
                    "status": self.remote_device.get("status", "disconnected"),
                }
            probe_id = f"probe-{int(time.time() * 1000)}"
            event = threading.Event()
            self._pending_probes[probe_id] = {"event": event, "response": None}

        t0 = time.monotonic()
        payload = json.dumps({
            "type": "probe",
            "id": probe_id,
            "content": message,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }) + "\n"

        try:
            client.sendall(payload.encode("utf-8"))
        except Exception as e:
            with self._lock:
                self._pending_probes.pop(probe_id, None)
            return {
                "success": False,
                "error": f"Socket transmission failed: {e}",
            }

        # Await real acknowledgment from agent
        signaled = event.wait(timeout=timeout)
        t1 = time.monotonic()
        rtt_ms = round((t1 - t0) * 1000, 2)

        with self._lock:
            probe_entry = self._pending_probes.pop(probe_id, None)

        if not signaled or not probe_entry or not probe_entry.get("response"):
            return {
                "success": False,
                "error": f"Timed out waiting for ACK from agent (> {timeout}s).",
                "rtt_ms": rtt_ms,
                "message_id": probe_id,
            }

        ack = probe_entry["response"]
        return {
            "success": True,
            "message_id": probe_id,
            "sent_message": message,
            "ack_content": ack.get("echo", message),
            "ack_type": ack.get("type", "probe_ack"),
            "rtt_ms": rtt_ms,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "recipient": self.remote_device.get("hostname") or self.remote_device.get("ip") or "Remote Agent",
            "note": "Successful ACK confirms bidirectional TCP socket delivery, not intrusion detection status.",
        }

    def _run(self):
        """Main server loop — accepts one client at a time."""
        self._server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self._server_socket.bind((self.host, self.port))
        except OSError as e:
            logger.error(f"Cannot bind to {self.host}:{self.port}: {e}")
            self._running = False
            return
        self._server_socket.listen(10)
        self._server_socket.settimeout(1.0)

        while self._running:
            try:
                client, addr = self._server_socket.accept()
                logger.info(f"Connection from {addr[0]}:{addr[1]}")
                with self._lock:
                    self._client_socket = client
                    self.remote_device["status"] = "connecting"
                    self.remote_device["ip"] = addr[0]
                    self.remote_device["port"] = addr[1]
                threading.Thread(
                    target=self._handle_client,
                    args=(client, addr),
                    daemon=True,
                ).start()
            except socket.timeout:
                continue
            except OSError:
                break

    def _handle_client(self, client: socket.socket, addr):
        """Handle a connected client — process HELLO, heartbeats, and probes."""
        client.settimeout(10.0)
        buffer = ""

        try:
            while self._running:
                try:
                    data = client.recv(4096)
                except socket.timeout:
                    if self.remote_device.get("last_heartbeat") and self._client_socket is client:
                        elapsed = time.time() - self.remote_device.get("_last_hb_time", time.time())
                        if elapsed > 30:
                            logger.warning("Heartbeat timeout from client")
                            break
                    continue

                if not data:
                    break

                # Feed packet to analyzer/detector callback
                if self.on_packet:
                    try:
                        self.on_packet({
                            "timestamp": time.time(),
                            "source_ip": addr[0],
                            "destination_ip": self.host if self.host != "0.0.0.0" else "127.0.0.1",
                            "source_port": addr[1],
                            "destination_port": self.port,
                            "protocol": "TCP",
                            "length": len(data),
                            "tcp_flags": "0x0018",
                            "protocols_str": "eth:ip:tcp",
                        })
                    except Exception:
                        pass

                buffer += data.decode("utf-8", errors="replace")

                # Process newline-delimited JSON messages
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON from client: {line[:100]}")
                        continue

                    self._process_message(client, msg, addr)

        except (OSError, ConnectionResetError):
            # Normal socket teardown or client disconnect
            pass
        except Exception as e:
            logger.error(f"Client handler error: {e}")
        finally:
            try:
                client.close()
            except Exception:
                pass
            self.registry.handle_disconnect(client)
            with self._lock:
                if self._client_socket is client:
                    self._client_socket = None
                    self.remote_device["status"] = "disconnected"
                    self.remote_device["hostname"] = None
            logger.info(f"Client {addr[0]}:{addr[1]} disconnected")

    def _process_message(self, client: socket.socket, msg: dict, addr=None):
        """Process a single JSON message from the client."""
        msg_type = msg.get("type", "")
        now = time.time()

        if msg_type == "hello":
            with self._lock:
                self.remote_device["status"] = "connected"
                self.remote_device["hostname"] = msg.get("hostname", "unknown")
                self.remote_device["connected_since"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                self.remote_device["last_message"] = "HELLO received"
                self.remote_device["_last_hb_time"] = now
            ack = json.dumps({
                "type": "hello_ack",
                "status": "connected",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "server_hostname": socket.gethostname(),
            }) + "\n"
            client.sendall(ack.encode())
            logger.info(f"HELLO from {msg.get('hostname')}, ACK sent")

        elif msg_type == "heartbeat":
            agent_rtt = msg.get("rtt_ms")
            send_time = msg.get("send_time", now)
            calculated_rtt = round((now - send_time) * 1000, 2) if isinstance(send_time, (int, float)) else None

            # Two computers have unsynchronized system clocks; reject negative or runaway wall-clock values
            if agent_rtt is not None and isinstance(agent_rtt, (int, float)) and agent_rtt >= 0:
                final_rtt = round(float(agent_rtt), 2)
            elif calculated_rtt is not None and 0 <= calculated_rtt < 1000:
                final_rtt = calculated_rtt
            else:
                prev_rtt = self.remote_device.get("rtt_ms")
                final_rtt = prev_rtt if (prev_rtt is not None and prev_rtt >= 0) else 1.0

            with self._lock:
                self.remote_device["last_heartbeat"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                self.remote_device["last_message"] = f"Heartbeat #{msg.get('sequence', '?')}"
                self.remote_device["rtt_ms"] = final_rtt
                self.remote_device["_last_hb_time"] = now

            # Update multi-agent registry last-seen/RTT for registered agents
            try:
                self.registry.record_heartbeat(client, final_rtt)
            except Exception:
                pass
            ack = json.dumps({
                "type": "heartbeat_ack",
                "status": "connected",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "sequence": msg.get("sequence"),
            }) + "\n"
            client.sendall(ack.encode())

        elif msg_type in ("probe_ack", "test_ack"):
            probe_id = msg.get("id")
            with self._lock:
                if probe_id in self._pending_probes:
                    self._pending_probes[probe_id]["response"] = msg
                    self._pending_probes[probe_id]["event"].set()
            logger.info(f"Received probe ACK for {probe_id}")

        elif msg_type == "register":
            res = self.registry.handle_register(client, addr, msg)
            if res.get("success"):
                with self._lock:
                    self._client_socket = client
                    self.remote_device["status"] = "connected"
                    self.remote_device["hostname"] = res.get("name", "unknown")
                    if addr:
                        self.remote_device["ip"] = addr[0]
                        self.remote_device["port"] = addr[1]
                    self.remote_device["connected_since"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                    self.remote_device["last_message"] = f"REGISTER ({res.get('agent_id')})"
                    self.remote_device["_last_hb_time"] = now

        elif msg_type == "peer_list_request":
            self.registry.handle_peer_list_request(client)

        elif msg_type == "connect_request":
            self.registry.handle_connect_request(client, msg)

        elif msg_type == "connect_accept":
            self.registry.handle_connect_accept(client, msg)

        elif msg_type == "connect_decline":
            self.registry.handle_connect_decline(client, msg)

        elif msg_type == "chat_message":
            self.registry.handle_chat_message(client, msg)

        else:
            logger.debug(f"Unknown message type: {msg_type}")
