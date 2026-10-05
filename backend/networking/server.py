"""
NetShield-ML — TCP Server (Computer B)
Accepts connections from remote NetShield agents, handles HELLO/ACK
and heartbeat protocol over JSON messages.
"""
import socket
import threading
import json
import time
import logging

logger = logging.getLogger("netshield.server")


class NetShieldServer:
    """TCP server that listens for remote NetShield agent connections."""

    def __init__(self, host: str = "0.0.0.0", port: int = 5000):
        self.host = host
        self.port = port
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
        if self._client_socket:
            try:
                self._client_socket.close()
            except Exception:
                pass
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

    def get_remote_state(self) -> dict:
        """Return current remote device state (thread-safe)."""
        with self._lock:
            return dict(self.remote_device)

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
        self._server_socket.listen(1)
        self._server_socket.settimeout(1.0)

        while self._running:
            try:
                client, addr = self._server_socket.accept()
                logger.info(f"Connection from {addr[0]}:{addr[1]}")
                self._client_socket = client
                self._handle_client(client, addr)
            except socket.timeout:
                continue
            except OSError:
                break

    def _handle_client(self, client: socket.socket, addr):
        """Handle a connected client — process HELLO then heartbeats."""
        client.settimeout(10.0)
        buffer = ""

        with self._lock:
            self.remote_device["status"] = "connecting"
            self.remote_device["ip"] = addr[0]
            self.remote_device["port"] = addr[1]

        try:
            while self._running:
                try:
                    data = client.recv(4096)
                except socket.timeout:
                    # Check if we haven't heard for too long
                    if self.remote_device.get("last_heartbeat"):
                        elapsed = time.time() - self.remote_device["_last_hb_time"]
                        if elapsed > 30:
                            logger.warning("Heartbeat timeout")
                            break
                    continue

                if not data:
                    break

                buffer += data.decode("utf-8", errors="replace")

                # Process each complete JSON message (newline-delimited)
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

                    self._process_message(client, msg)

        except Exception as e:
            logger.error(f"Client handler error: {e}")
        finally:
            client.close()
            self._client_socket = None
            with self._lock:
                self.remote_device["status"] = "disconnected"
                self.remote_device["hostname"] = None
            logger.info(f"Client {addr[0]}:{addr[1]} disconnected")

    def _process_message(self, client: socket.socket, msg: dict):
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
            # Send ACK
            ack = json.dumps({
                "type": "hello_ack",
                "status": "connected",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "server_hostname": socket.gethostname(),
            }) + "\n"
            client.sendall(ack.encode())
            logger.info(f"HELLO from {msg.get('hostname')}, ACK sent")

        elif msg_type == "heartbeat":
            send_time = msg.get("send_time", now)
            rtt = round((now - send_time) * 1000, 2) if isinstance(send_time, (int, float)) else None
            with self._lock:
                self.remote_device["last_heartbeat"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                self.remote_device["last_message"] = f"Heartbeat #{msg.get('sequence', '?')}"
                self.remote_device["rtt_ms"] = rtt
                self.remote_device["_last_hb_time"] = now
            # Send heartbeat ACK
            ack = json.dumps({
                "type": "heartbeat_ack",
                "status": "connected",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "sequence": msg.get("sequence"),
            }) + "\n"
            client.sendall(ack.encode())

        else:
            logger.debug(f"Unknown message type: {msg_type}")
