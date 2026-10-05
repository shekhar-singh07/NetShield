"""
NetShield-ML — Packet Capture (TShark wrapper)
Captures live network traffic using TShark (Wireshark CLI).
Falls back gracefully if TShark is not installed.
"""
import subprocess
import threading
import shutil
import time
import logging
import json

logger = logging.getLogger("netshield.capture")


class PacketCapture:
    """
    Wraps TShark to capture packets in real time.
    Emits parsed packet dicts to a callback function.
    """

    def __init__(self, interface: str = "", on_packet=None):
        self.interface = interface
        self.on_packet = on_packet  # callback(packet_dict)
        self._process = None
        self._thread = None
        self._running = False
        self._tshark_path = None
        self.available = False
        self.unavailable_reason = ""
        self._check_tshark()

    def _check_tshark(self):
        """Check if TShark is available on this system."""
        path = shutil.which("tshark")
        if path:
            self._tshark_path = path
            self.available = True
            logger.info(f"TShark found at: {path}")
        else:
            # Check common Windows install paths
            import os
            common_paths = [
                r"C:\Program Files\Wireshark\tshark.exe",
                r"C:\Program Files (x86)\Wireshark\tshark.exe",
            ]
            for p in common_paths:
                if os.path.isfile(p):
                    self._tshark_path = p
                    self.available = True
                    logger.info(f"TShark found at: {p}")
                    return
            self.available = False
            self.unavailable_reason = "TShark not found. Install Wireshark to enable packet capture."
            logger.warning(self.unavailable_reason)

    def get_interfaces(self) -> list:
        """List available network interfaces via TShark."""
        if not self.available:
            return []
        try:
            result = subprocess.run(
                [self._tshark_path, "-D"],
                capture_output=True, text=True, timeout=5
            )
            interfaces = []
            for line in result.stdout.strip().split("\n"):
                if line.strip():
                    interfaces.append(line.strip())
            return interfaces
        except Exception as e:
            logger.error(f"Failed to list interfaces: {e}")
            return []

    def start(self, interface: str = None):
        """Start capturing packets in a background thread."""
        if not self.available:
            logger.error("Cannot start capture — TShark not available")
            return False

        if self._running:
            return True

        iface = interface or self.interface
        if not iface:
            logger.error("No capture interface specified")
            self.unavailable_reason = "No capture interface configured. Set NETSHIELD_CAPTURE_INTERFACE."
            return False

        self.interface = iface
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info(f"Packet capture started on interface: {iface}")
        return True

    def stop(self):
        """Stop capturing packets."""
        self._running = False
        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=3)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
        self._process = None
        logger.info("Packet capture stopped")

    def _capture_loop(self):
        """Run TShark and parse output line by line."""
        # TShark fields we want:
        # frame.time_epoch, ip.src, ip.dst, tcp.srcport, tcp.dstport,
        # udp.srcport, udp.dstport, frame.protocols, frame.len, tcp.flags
        cmd = [
            self._tshark_path,
            "-i", self.interface,
            "-l",  # line-buffered
            "-T", "fields",
            "-e", "frame.time_epoch",
            "-e", "ip.src",
            "-e", "ip.dst",
            "-e", "tcp.srcport",
            "-e", "tcp.dstport",
            "-e", "udp.srcport",
            "-e", "udp.dstport",
            "-e", "frame.protocols",
            "-e", "frame.len",
            "-e", "tcp.flags",
            "-E", "separator=|",
            "-E", "occurrence=f",
        ]

        try:
            self._process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            logger.error("TShark binary not found")
            self._running = False
            self.available = False
            self.unavailable_reason = "TShark binary not found at expected path"
            return
        except Exception as e:
            logger.error(f"Failed to start TShark: {e}")
            self._running = False
            return

        try:
            for line in self._process.stdout:
                if not self._running:
                    break
                line = line.strip()
                if not line:
                    continue
                packet = self._parse_line(line)
                if packet and self.on_packet:
                    self.on_packet(packet)
        except Exception as e:
            logger.error(f"Capture loop error: {e}")
        finally:
            self._running = False
            if self._process:
                try:
                    self._process.terminate()
                except Exception:
                    pass

    def _parse_line(self, line: str) -> dict | None:
        """Parse a TShark field-separated line into a packet dict."""
        parts = line.split("|")
        if len(parts) < 9:
            return None

        try:
            timestamp = float(parts[0]) if parts[0] else time.time()
        except ValueError:
            timestamp = time.time()

        src_ip = parts[1] or ""
        dst_ip = parts[2] or ""
        tcp_sport = int(parts[3]) if parts[3] else None
        tcp_dport = int(parts[4]) if parts[4] else None
        udp_sport = int(parts[5]) if parts[5] else None
        udp_dport = int(parts[6]) if parts[6] else None
        protocols_str = parts[7] or ""
        try:
            length = int(parts[8]) if parts[8] else 0
        except ValueError:
            length = 0
        tcp_flags = parts[9] if len(parts) > 9 else ""

        # Determine protocol
        protocol = "OTHER"
        if "tcp" in protocols_str.lower():
            protocol = "TCP"
        elif "udp" in protocols_str.lower():
            protocol = "UDP"
        elif "icmp" in protocols_str.lower():
            protocol = "ICMP"

        src_port = tcp_sport if tcp_sport else udp_sport
        dst_port = tcp_dport if tcp_dport else udp_dport

        return {
            "timestamp": timestamp,
            "source_ip": src_ip,
            "destination_ip": dst_ip,
            "source_port": src_port,
            "destination_port": dst_port,
            "protocol": protocol,
            "length": length,
            "tcp_flags": tcp_flags,
            "protocols_str": protocols_str,
        }
