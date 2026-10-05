"""
NetShield-ML — TCP Client (Computer A)
Connects to the NetShield server on Computer B,
sends HELLO and periodic heartbeats.

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
        self._thread = None
        self._sequence = 0
        self.connected = False
        self.last_ack = None

    def connect(self):
        """Connect to the server and start heartbeat loop."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def disconnect(self):
        """Disconnect from the server."""
        self._running = False
        self.connected = False
        if self._socket:
            try:
                self._socket.close()
            except Exception:
                pass

    def _run(self):
        """Connect, send HELLO, then heartbeats every 3 seconds."""
        try:
            self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._socket.settimeout(5.0)
            logger.info(f"Connecting to {self.host}:{self.port}...")
            self._socket.connect((self.host, self.port))
            logger.info("Connected!")

            # Send HELLO
            hello = json.dumps({
                "type": "hello",
                "hostname": socket.gethostname(),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }) + "\n"
            self._socket.sendall(hello.encode())

            # Wait for ACK
            ack_data = self._recv_line()
            if ack_data:
                ack = json.loads(ack_data)
                if ack.get("type") == "hello_ack":
                    self.connected = True
                    self.last_ack = ack
                    logger.info(f"HELLO ACK received from {ack.get('server_hostname', '?')}")

            # Heartbeat loop
            while self._running and self.connected:
                time.sleep(3.0)
                self._sequence += 1
                hb = json.dumps({
                    "type": "heartbeat",
                    "hostname": socket.gethostname(),
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "sequence": self._sequence,
                    "send_time": time.time(),
                }) + "\n"
                try:
                    self._socket.sendall(hb.encode())
                    ack_data = self._recv_line()
                    if ack_data:
                        ack = json.loads(ack_data)
                        self.last_ack = ack
                        logger.debug(f"Heartbeat #{self._sequence} ACK")
                    else:
                        logger.warning("No heartbeat ACK received")
                        self.connected = False
                except Exception as e:
                    logger.error(f"Heartbeat error: {e}")
                    self.connected = False

        except ConnectionRefusedError:
            logger.error(f"Connection refused: {self.host}:{self.port}")
        except socket.timeout:
            logger.error(f"Connection timeout: {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Client error: {e}")
        finally:
            self.connected = False
            self._running = False
            if self._socket:
                try:
                    self._socket.close()
                except Exception:
                    pass
            logger.info("Client disconnected")

    def _recv_line(self) -> str | None:
        """Receive a newline-delimited message."""
        buf = ""
        try:
            while "\n" not in buf:
                data = self._socket.recv(4096)
                if not data:
                    return None
                buf += data.decode("utf-8", errors="replace")
            return buf.split("\n")[0].strip()
        except socket.timeout:
            return None


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
