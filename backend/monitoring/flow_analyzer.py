"""
NetShield-ML — Flow Analyzer
Aggregates raw packets into network flows and computes per-flow statistics.
A flow is identified by: (src_ip, dst_ip, src_port, dst_port, protocol).
"""
import time
import threading
import logging
from collections import defaultdict

logger = logging.getLogger("netshield.flow")


class FlowAnalyzer:
    """
    Aggregates packets into flows and computes statistics.
    Thread-safe — can be called from the packet capture callback.
    """

    # Flows older than this are considered expired
    FLOW_TIMEOUT = 60.0  # seconds

    def __init__(self):
        self._lock = threading.RLock()
        self._flows = {}  # flow_key -> flow_dict
        self._total_packets = 0
        self._total_bytes = 0
        self._start_time = time.time()
        # Per-second tracking for rate calculation
        self._second_packets = 0
        self._second_bytes = 0
        self._last_rate_time = time.time()
        self._current_pps = 0.0
        self._current_bps = 0.0
        # Protocol counters
        self._protocol_counts = defaultdict(int)

    def process_packet(self, packet: dict):
        """Process a single packet and update flow state."""
        src_ip = packet.get("source_ip", "")
        dst_ip = packet.get("destination_ip", "")
        src_port = packet.get("source_port")
        dst_port = packet.get("destination_port")
        protocol = packet.get("protocol", "OTHER")
        length = packet.get("length", 0)
        tcp_flags = packet.get("tcp_flags", "")
        timestamp = packet.get("timestamp", time.time())

        flow_key = (src_ip, dst_ip, src_port, dst_port, protocol)

        with self._lock:
            self._total_packets += 1
            self._total_bytes += length
            self._second_packets += 1
            self._second_bytes += length
            self._protocol_counts[protocol] += 1

            # Update rate calculation every second
            now = time.time()
            elapsed = now - self._last_rate_time
            if elapsed >= 1.0:
                self._current_pps = self._second_packets / elapsed
                self._current_bps = self._second_bytes / elapsed
                self._second_packets = 0
                self._second_bytes = 0
                self._last_rate_time = now

            # Update or create flow
            if flow_key in self._flows:
                flow = self._flows[flow_key]
                flow["packet_count"] += 1
                flow["byte_count"] += length
                flow["last_seen"] = timestamp
                flow["duration"] = timestamp - flow["first_seen"]
                # TCP flag tracking
                if tcp_flags:
                    flags_int = self._parse_tcp_flags(tcp_flags)
                    if flags_int & 0x02:  # SYN
                        flow["syn_count"] += 1
                    if flags_int & 0x10:  # ACK
                        flow["ack_count"] += 1
                    if flags_int & 0x04:  # RST
                        flow["rst_count"] += 1
            else:
                self._flows[flow_key] = {
                    "source_ip": src_ip,
                    "destination_ip": dst_ip,
                    "source_port": src_port,
                    "destination_port": dst_port,
                    "protocol": protocol,
                    "packet_count": 1,
                    "byte_count": length,
                    "first_seen": timestamp,
                    "last_seen": timestamp,
                    "duration": 0.0,
                    "syn_count": 1 if (tcp_flags and self._parse_tcp_flags(tcp_flags) & 0x02) else 0,
                    "ack_count": 1 if (tcp_flags and self._parse_tcp_flags(tcp_flags) & 0x10) else 0,
                    "rst_count": 1 if (tcp_flags and self._parse_tcp_flags(tcp_flags) & 0x04) else 0,
                }

    def _parse_tcp_flags(self, flags_str: str) -> int:
        """Parse TCP flags from hex string (e.g., '0x0002')."""
        try:
            return int(flags_str, 16)
        except (ValueError, TypeError):
            return 0

    def get_active_flows(self) -> list:
        """Return list of currently active flows."""
        now = time.time()
        with self._lock:
            # Clean up expired flows
            expired = [k for k, v in self._flows.items()
                       if now - v["last_seen"] > self.FLOW_TIMEOUT]
            for k in expired:
                del self._flows[k]

            result = []
            for flow in self._flows.values():
                duration = flow["duration"]
                pps = flow["packet_count"] / max(duration, 0.001)
                bps = flow["byte_count"] / max(duration, 0.001)
                result.append({
                    **flow,
                    "packets_per_sec": round(pps, 2),
                    "bytes_per_sec": round(bps, 2),
                })
            return result

    def get_flow_count(self) -> int:
        """Return count of active flows."""
        now = time.time()
        with self._lock:
            return sum(1 for v in self._flows.values()
                       if now - v["last_seen"] <= self.FLOW_TIMEOUT)

    def get_stats(self) -> dict:
        """Return aggregated statistics from all flows."""
        with self._lock:
            total = max(self._total_packets, 1)
            protocols = {}
            for proto, count in self._protocol_counts.items():
                protocols[proto.lower()] = round(count / total * 100, 1)

            return {
                "total_packets": self._total_packets,
                "total_bytes": self._total_bytes,
                "packets_per_second": round(self._current_pps, 1),
                "bytes_per_second": round(self._current_bps, 1),
                "bandwidth_mbps": round(self._current_bps * 8 / 1_000_000, 2),
                "active_flows": self.get_flow_count(),
                "protocols": protocols,
            }

    def reset(self):
        """Reset all flow state."""
        with self._lock:
            self._flows.clear()
            self._total_packets = 0
            self._total_bytes = 0
            self._second_packets = 0
            self._second_bytes = 0
            self._current_pps = 0.0
            self._current_bps = 0.0
            self._protocol_counts.clear()
            self._start_time = time.time()
            self._last_rate_time = time.time()
