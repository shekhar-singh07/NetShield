"""
NetShield-ML — Rule-Based Detection
Heuristic detection rules for controlled traffic patterns.

IMPORTANT: These are heuristic/controlled detection patterns,
NOT comprehensive attack detection. Suitable for a college
Computer Networks project demonstration.
"""
import time
import logging

logger = logging.getLogger("netshield.rules")


class RuleBasedDetector:
    """
    Applies configurable heuristic rules to extracted features.
    Each rule returns a detection event dict or None.
    """

    def __init__(
        self,
        packet_rate_threshold: int = 500,
        port_scan_threshold: int = 15,
        connection_burst_threshold: int = 50,
    ):
        self.packet_rate_threshold = packet_rate_threshold
        self.port_scan_threshold = port_scan_threshold
        self.connection_burst_threshold = connection_burst_threshold
        # Track which sources already triggered to avoid flooding
        self._recent_alerts = {}  # (src_ip, type) -> last_alert_time
        self._cooldown = 10.0  # seconds between repeated alerts for same source+type

    def analyze(self, features: dict) -> list:
        """
        Analyze features for a single source IP.
        Returns a list of detection events (may be empty).
        """
        events = []
        src = features.get("source_ip", "")
        now = time.time()

        # Rule 1: Traffic Spike — high packet rate
        if features.get("packet_rate", 0) > self.packet_rate_threshold:
            evt = self._create_event_if_new(src, "TRAFFIC_SPIKE", "HIGH", now,
                f"Packet rate {features['packet_rate']:.0f}/s exceeds threshold "
                f"of {self.packet_rate_threshold}/s from {src}")
            if evt:
                events.append(evt)

        # Rule 2: Port Scan — many unique destination ports
        if features.get("unique_dst_ports", 0) > self.port_scan_threshold:
            evt = self._create_event_if_new(src, "PORT_SCAN_LIKE", "HIGH", now,
                f"Source {src} contacted {features['unique_dst_ports']} unique "
                f"destination ports (threshold: {self.port_scan_threshold})")
            if evt:
                events.append(evt)

        # Rule 3: Connection Burst — very high SYN rate
        if features.get("connection_rate", 0) > self.connection_burst_threshold:
            evt = self._create_event_if_new(src, "CONNECTION_BURST", "MEDIUM", now,
                f"Connection rate {features['connection_rate']:.0f}/s from {src} "
                f"exceeds threshold of {self.connection_burst_threshold}/s")
            if evt:
                events.append(evt)

        # Rule 4: Repeated failed connections — high RST count
        if features.get("rst_count", 0) > 20:
            evt = self._create_event_if_new(src, "REPEATED_CONNECTION_FAILURE", "MEDIUM", now,
                f"Source {src} has {features['rst_count']} TCP RST packets "
                f"indicating repeated failed connection attempts")
            if evt:
                events.append(evt)

        return events

    def _create_event_if_new(self, src_ip, event_type, severity, now, reason) -> dict | None:
        """Create a detection event only if the cooldown has passed."""
        key = (src_ip, event_type)
        last_time = self._recent_alerts.get(key, 0)
        if now - last_time < self._cooldown:
            return None

        self._recent_alerts[key] = now
        return {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source_ip": src_ip,
            "destination_ip": "",  # filled by caller if available
            "protocol": "TCP",
            "type": event_type,
            "severity": severity,
            "reason": reason,
            "confidence": None,  # No ML model — no confidence score
        }
