"""
NetShield-ML — Feature Extraction
Extracts detection-relevant features from flow data.
These features are used by both rule-based and future ML detectors.
"""
import time
from collections import defaultdict


class FeatureExtractor:
    """
    Extracts features for detection from accumulated flow data.
    Maintains sliding windows for rate-based features.
    """

    def __init__(self, window_seconds: int = 30):
        self.window = window_seconds
        # Track per-source activity
        self._src_packets = defaultdict(list)        # src_ip -> [timestamps]
        self._src_bytes = defaultdict(list)          # src_ip -> [(timestamp, length)]
        self._src_dst_ports = defaultdict(list)      # src_ip -> [(timestamp, dst_port)]
        self._src_connections = defaultdict(list)    # src_ip -> [timestamps of SYN]
        self._src_rsts = defaultdict(list)           # src_ip -> [timestamps of RST]
        self._src_last_seen = {}

    def update_from_packet(self, packet: dict):
        """Update feature state from a single packet."""
        src = packet.get("source_ip", "")
        dst_port = packet.get("destination_port")
        tcp_flags = packet.get("tcp_flags", "")
        length = packet.get("length", 64)
        ts = packet.get("timestamp", time.time())

        if not src:
            return

        self._src_packets[src].append(ts)
        self._src_bytes[src].append((ts, length))
        self._src_last_seen[src] = ts

        if dst_port is not None:
            self._src_dst_ports[src].append((ts, dst_port))

        # Track SYN (connection attempts) and RST
        if tcp_flags:
            try:
                flags_int = int(tcp_flags, 16) if isinstance(tcp_flags, str) and tcp_flags.startswith("0x") else int(tcp_flags)
                if flags_int & 0x02:  # SYN
                    self._src_connections[src].append(ts)
                if flags_int & 0x04:  # RST
                    self._src_rsts[src].append(ts)
            except (ValueError, TypeError):
                pass

    def get_features_for_source(self, src_ip: str) -> dict:
        """Extract detection features for a specific source IP."""
        packet_timestamps = self._src_packets.get(src_ip, [])
        latest_packet = max(packet_timestamps, default=0.0)
        wall_clock = time.time()
        if latest_packet and wall_clock - latest_packet <= self.window:
            now = latest_packet
        else:
            now = wall_clock
        cutoff = now - self.window
        burst_cutoff = now - 2.0  # 2-second short window for bursts

        # Packets in 30s window
        recent_packets = [t for t in self._src_packets.get(src_ip, []) if t > cutoff]
        packet_rate = len(recent_packets) / max(self.window, 1)

        # Packets in last 2 seconds (instantaneous burst rate)
        burst_packets = [t for t in self._src_packets.get(src_ip, []) if t > burst_cutoff]
        burst_rate = len(burst_packets) / 2.0

        # Effective packet rate (whichever is higher, capturing sudden bursts or sustained load)
        effective_rate = max(packet_rate, burst_rate)

        # Unique destination ports within sliding window
        recent_ports = {p for t, p in self._src_dst_ports.get(src_ip, []) if t > cutoff}
        unique_ports = len(recent_ports)

        # Connection rate (SYN count in window and burst)
        recent_conns = [t for t in self._src_connections.get(src_ip, []) if t > cutoff]
        burst_conns = [t for t in self._src_connections.get(src_ip, []) if t > burst_cutoff]
        conn_rate = len(recent_conns) / max(self.window, 1)
        burst_conn_rate = len(burst_conns) / 2.0
        effective_conn_rate = max(conn_rate, burst_conn_rate)

        # Byte calculations
        recent_bytes = [b for t, b in self._src_bytes.get(src_ip, []) if t > cutoff]
        total_bytes = sum(recent_bytes)
        avg_pkt_size = (total_bytes / len(recent_packets)) if recent_packets else 0.0

        # RST count within sliding window
        rst_count = len([t for t in self._src_rsts.get(src_ip, []) if t > cutoff])

        # SYN ratio (fraction of packets that are SYN)
        syn_ratio = (len(recent_conns) / len(recent_packets)) if recent_packets else 0.0

        return {
            "source_ip": src_ip,
            "packet_rate": round(effective_rate, 2),
            "window_packet_rate": round(packet_rate, 2),
            "burst_rate": round(burst_rate, 2),
            "unique_dst_ports": unique_ports,
            "connection_rate": round(effective_conn_rate, 2),
            "recent_connections": len(recent_conns),
            "rst_count": rst_count,
            "recent_packets": len(recent_packets),
            "avg_packet_size": round(avg_pkt_size, 1),
            "syn_ratio": round(syn_ratio, 3),
        }

    def get_all_source_features(self) -> list:
        """Extract features for all currently active sources (seen within window)."""
        now = time.time()
        active_sources = [
            src for src, last_seen in self._src_last_seen.items()
            if now - last_seen <= self.window
        ]
        return [self.get_features_for_source(src) for src in active_sources]

    def cleanup(self):
        """Remove stale data outside the window."""
        cutoff = time.time() - self.window * 2
        for src in list(self._src_packets.keys()):
            self._src_packets[src] = [t for t in self._src_packets[src] if t > cutoff]
            self._src_bytes[src] = [(t, b) for t, b in self._src_bytes[src] if t > cutoff]
            self._src_dst_ports[src] = [(t, p) for t, p in self._src_dst_ports.get(src, []) if t > cutoff]
            self._src_connections[src] = [t for t in self._src_connections.get(src, []) if t > cutoff]
            self._src_rsts[src] = [t for t in self._src_rsts.get(src, []) if t > cutoff]
            if not self._src_packets[src]:
                del self._src_packets[src]
                self._src_bytes.pop(src, None)
                self._src_dst_ports.pop(src, None)
                self._src_connections.pop(src, None)
                self._src_rsts.pop(src, None)
                self._src_last_seen.pop(src, None)
