"""
NetShield-ML — TCP Client (Computer A)
Connects to the NetShield server on Computer B,
handles HELLO/ACK, periodic heartbeats, and returns real ACKs for server probes/tests.

Run this script standalone on Computer A:
    python client.py --host 192.168.x.x --port 5000
"""
import os
import socket
import json
import time
import threading
import logging
import argparse

logger = logging.getLogger("netshield.client")


def _load_dotenv():
    """Load variables from .env file if available."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
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


class NetShieldClient:
    """TCP client that connects to a NetShield server."""

    def __init__(self, host: str = "127.0.0.1", port: int = 5000):
        self.host = host
        self.port = port
        self._running = False
        self._socket = None
        self._rx_thread = None
        self._hb_thread = None
        self._sequence = 0
        self.connected = False
        self.last_ack = None
        self.error_msg = None

    def connect(self):
        """Connect to the server and start receiver + heartbeat loops."""
        if self._running:
            return
        self._running = True
        self.error_msg = None
        self._rx_thread = threading.Thread(target=self._run, daemon=True)
        self._rx_thread.start()

    def disconnect(self):
        """Disconnect from the server."""
        self._running = False
        self.connected = False
        if self._socket:
            try:
                self._socket.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                self._socket.close()
            except Exception:
                pass
            self._socket = None

    def _run(self):
        """Connect to server, send HELLO, and listen continuously for incoming frames."""
        try:
            self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._socket.settimeout(5.0)
            logger.info(f"Connecting to {self.host}:{self.port}...")
            self._socket.connect((self.host, self.port))
            self._socket.settimeout(None)  # Blocking socket for clean buffer reading

            # Send HELLO
            hello = json.dumps({
                "type": "hello",
                "hostname": socket.gethostname(),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }) + "\n"
            self._socket.sendall(hello.encode("utf-8"))

            # Start heartbeat loop in dedicated thread
            self._hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
            self._hb_thread.start()

            # Continuous receiver loop
            buffer = ""
            while self._running:
                data = self._socket.recv(4096)
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

        except ConnectionRefusedError:
            self.error_msg = f"Connection refused to {self.host}:{self.port}"
            logger.error(self.error_msg)
        except Exception as e:
            self.error_msg = str(e)
            logger.error(f"Client communication error: {e}")
        finally:
            self.connected = False
            self._running = False
            if self._socket:
                try:
                    self._socket.close()
                except Exception:
                    pass
                self._socket = None
            logger.info("Client disconnected")

    def _handle_server_message(self, msg: dict):
        """Handle incoming server messages and return immediate ACKs for probes."""
        msg_type = msg.get("type")

        if msg_type == "hello_ack":
            self.connected = True
            self.last_ack = msg
            logger.info(f"HELLO ACK received from {msg.get('server_hostname', 'server')}")

        elif msg_type == "heartbeat_ack":
            self.last_ack = msg
            logger.debug(f"Heartbeat #{msg.get('sequence')} acknowledged")

        elif msg_type == "probe":
            # Echo real ACK back to server immediately
            probe_id = msg.get("id")
            ack = json.dumps({
                "type": "probe_ack",
                "id": probe_id,
                "echo": msg.get("content"),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "hostname": socket.gethostname(),
            }) + "\n"
            try:
                if self._socket:
                    self._socket.sendall(ack.encode("utf-8"))
                    logger.info(f"Replied to server probe {probe_id}")
            except Exception as e:
                logger.error(f"Failed to reply to probe: {e}")

    def _heartbeat_loop(self):
        """Send periodic heartbeats every 3 seconds while connected."""
        while self._running:
            time.sleep(3.0)
            if not self.connected or not self._socket:
                continue

            self._sequence += 1
            hb = json.dumps({
                "type": "heartbeat",
                "hostname": socket.gethostname(),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "sequence": self._sequence,
                "send_time": time.time(),
            }) + "\n"
            try:
                self._socket.sendall(hb.encode("utf-8"))
            except Exception:
                self.connected = False
                break


# ── Standalone runner for Computer A ──
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )

    default_host = os.getenv("REMOTE_HOST", os.getenv("SERVER_HOST", "127.0.0.1"))
    default_port = int(os.getenv("REMOTE_PORT", os.getenv("SERVER_PORT", "5000")))

    parser = argparse.ArgumentParser(description="NetShield Agent — Computer A")
    parser.add_argument("--host", default=default_host, help=f"Server IP (Computer B, default: {default_host})")
    parser.add_argument("--port", type=int, default=default_port, help=f"Server TCP port (default: {default_port})")
    args = parser.parse_args()

    client = NetShieldClient(host=args.host, port=args.port)
    print(f"\n{'='*50}")
    print(f"  NetShield Agent — connecting to {args.host}:{args.port}")
    print(f"{'='*50}\n")
    client.connect()

    try:
        while True:
            time.sleep(1)
            if not client._running:
                print("Disconnected. Exiting.")
                break
    except KeyboardInterrupt:
        print("\nShutting down agent...")
        client.disconnect()
