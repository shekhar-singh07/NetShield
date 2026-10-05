"""
NetShield-ML — Traffic Generator & Agent (Computer A)
Runs on Computer A to interact with Computer B (NetShield Server).

Capabilities:
1. TCP Heartbeat Agent: Maintains link with Computer B (port 5000), reports RTT.
2. Network Attack Simulator:
   - Port Scan: Attempts rapid TCP connections across port range.
   - Traffic Spike: Sends rapid bursts of UDP datagrams.
   - Connection Burst: Rapidly opens and closes TCP connections.
   - Normal Traffic: Periodic standard requests.
3. Interactive CLI menu or scripted batch mode.

Usage:
    python agent/traffic_generator.py --server 192.168.1.10 --port 5000
"""
import os
import sys
import time
import socket
import argparse
import threading
import json

try:
    import urllib.request
except ImportError:
    pass


def _load_dotenv():
    """Load variables from .env file if available."""
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


class NetShieldAgent:
    """Connects to Computer B TCP server and streams heartbeats."""

    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.sock = None
        self.running = False
        self.connected = False
        self.seq = 0
        self.last_rtt = None

    def start(self):
        self.running = True
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()

    def stop(self):
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass

    def _loop(self):
        while self.running:
            try:
                print(f"[Agent] Connecting to Computer B at {self.host}:{self.port}...")
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.settimeout(5.0)
                self.sock.connect((self.host, self.port))
                self.connected = True
                print(f"[Agent] Connected to {self.host}:{self.port}")

                # Send HELLO
                hello = json.dumps({
                    "type": "hello",
                    "hostname": socket.gethostname(),
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                }) + "\n"
                self.sock.sendall(hello.encode())

                # Read HELLO ACK
                ack = self._recv_line()
                print(f"[Agent] Server ACK: {ack}")

                # Heartbeat loop
                while self.running and self.connected:
                    time.sleep(3.0)
                    self.seq += 1
                    send_t = time.time()
                    hb = json.dumps({
                        "type": "heartbeat",
                        "hostname": socket.gethostname(),
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                        "sequence": self.seq,
                        "send_time": send_t,
                    }) + "\n"
                    self.sock.sendall(hb.encode())

                    reply = self._recv_line()
                    if reply:
                        self.last_rtt = round((time.time() - send_t) * 1000, 2)
                        print(f"[Agent] Heartbeat #{self.seq} ACK (RTT: {self.last_rtt}ms)")
                    else:
                        print("[Agent] No heartbeat ACK, reconnecting...")
                        break

            except Exception as e:
                print(f"[Agent] Connection error: {e}. Retrying in 4s...")
                self.connected = False
                time.sleep(4.0)
            finally:
                if self.sock:
                    try:
                        self.sock.close()
                    except Exception:
                        pass
                self.connected = False


    def _recv_line(self):
        buf = ""
        while "\n" not in buf:
            try:
                chunk = self.sock.recv(1024)
                if not chunk:
                    return None
                buf += chunk.decode("utf-8", errors="replace")
            except socket.timeout:
                return None
        return buf.split("\n")[0].strip()


def run_port_scan(target_ip: str, start_port: int = 20, end_port: int = 45):
    """Simulate a TCP port scan across a range of ports."""
    print(f"\n[Attack Sim] Launching Port Scan on {target_ip} (ports {start_port}-{end_port})...")
    scanned = 0
    for p in range(start_port, end_port + 1):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.15)
        try:
            s.connect((target_ip, p))
            print(f"  Port {p}: OPEN")
        except Exception:
            pass
        finally:
            s.close()
        scanned += 1
        time.sleep(0.02)
    print(f"[Attack Sim] Port scan complete. Probed {scanned} ports.\n")


def run_traffic_spike(target_ip: str, target_port: int = 5000, count: int = 400):
    """Simulate a traffic spike by blasting UDP datagrams."""
    print(f"\n[Attack Sim] Blasting {count} UDP packets to {target_ip}:{target_port}...")
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    payload = b"X" * 1024  # 1 KB per packet
    sent = 0
    start = time.time()
    for _ in range(count):
        try:
            s.sendto(payload, (target_ip, target_port))
            sent += 1
        except Exception:
            pass
    elapsed = max(time.time() - start, 0.001)
    s.close()
    rate = sent / elapsed
    print(f"[Attack Sim] Sent {sent} packets in {elapsed:.2f}s (~{rate:.0f} pkts/s)\n")


def run_connection_burst(target_ip: str, target_port: int = 5000, count: int = 35):
    """Rapidly initiate TCP handshakes."""
    print(f"\n[Attack Sim] Rapidly creating {count} TCP connections to {target_ip}:{target_port}...")
    opened = 0
    for _ in range(count):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        try:
            s.connect((target_ip, target_port))
            opened += 1
        except Exception:
            pass
        finally:
            s.close()
        time.sleep(0.01)
    print(f"[Attack Sim] Connection burst finished. {opened} connections opened.\n")


def trigger_api_simulation(api_url: str, scenario: str):
    """Trigger the backend's simulation endpoint via HTTP."""
    url = f"{api_url}/api/simulate/traffic?scenario={scenario}"
    print(f"\n[API Sim] POST {url}...")
    try:
        req = urllib.request.Request(url, data=b"", method="POST")
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode())
            print(f"[API Sim] Result: {json.dumps(data, indent=2)}\n")
    except Exception as e:
        print(f"[API Sim] Error calling API: {e}\n")


def main():
    default_server = os.getenv("REMOTE_HOST", os.getenv("SERVER_HOST", "127.0.0.1"))
    default_port = int(os.getenv("REMOTE_PORT", os.getenv("SERVER_PORT", "5000")))
    default_api_port = int(os.getenv("REMOTE_API_PORT", os.getenv("API_PORT", "8000")))

    parser = argparse.ArgumentParser(description="NetShield-ML Traffic Generator (Computer A)")
    parser.add_argument("--server", default=default_server, help=f"Computer B IP address (default: {default_server})")
    parser.add_argument("--port", type=int, default=default_port, help=f"Computer B TCP Server port (default: {default_port})")
    parser.add_argument("--api-port", type=int, default=default_api_port, help=f"Computer B API port (default: {default_api_port})")
    parser.add_argument("--scenario", choices=["port_scan", "traffic_spike", "connection_burst", "agent_only"], help="Run non-interactively")
    args = parser.parse_args()

    api_url = f"http://{args.server}:{args.api_port}"

    # Start background agent
    agent = NetShieldAgent(args.server, args.port)
    agent.start()

    if args.scenario:
        time.sleep(1.0)
        if args.scenario == "port_scan":
            run_port_scan(args.server)
        elif args.scenario == "traffic_spike":
            run_traffic_spike(args.server, args.port)
        elif args.scenario == "connection_burst":
            run_connection_burst(args.server, args.port)
        return

    # Interactive menu
    print("=" * 60)
    print("  NetShield-ML — Traffic Generator & Agent (Computer A)")
    print(f"  Target Server: {args.server}:{args.port}")
    print(f"  Target API:    {api_url}")
    print("=" * 60)

    try:
        while True:
            print("\nSelect traffic / attack scenario to execute:")
            print("  [1] Send Port Scan Simulation (Real Sockets)")
            print("  [2] Send Traffic Spike (Real UDP Datagrams)")
            print("  [3] Send Connection Burst (Real TCP Handshakes)")
            print("  [4] Trigger Detection via API: Port Scan")
            print("  [5] Trigger Detection via API: Traffic Spike")
            print("  [6] Trigger Detection via API: Connection Burst")
            print("  [7] Trigger Detection via API: Normal Mixed Traffic")
            print("  [q] Quit")
            choice = input("\nEnter choice (1-7, q): ").strip().lower()

            if choice == "1":
                run_port_scan(args.server)
            elif choice == "2":
                run_traffic_spike(args.server, args.port)
            elif choice == "3":
                run_connection_burst(args.server, args.port)
            elif choice == "4":
                trigger_api_simulation(api_url, "port_scan")
            elif choice == "5":
                trigger_api_simulation(api_url, "traffic_spike")
            elif choice == "6":
                trigger_api_simulation(api_url, "connection_burst")
            elif choice == "7":
                trigger_api_simulation(api_url, "normal")
            elif choice == "q":
                break
            else:
                print("Invalid selection.")
    except KeyboardInterrupt:
        pass
    finally:
        print("\nStopping agent...")
        agent.stop()


if __name__ == "__main__":
    main()
