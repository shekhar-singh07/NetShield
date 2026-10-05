"""
NetShield-ML — Metrics Collector
Aggregates real metrics from the flow analyzer and packet capture.
Returns zero/unavailable state when no capture is running.
"""
import time
import threading
import logging

logger = logging.getLogger("netshield.metrics")


class MetricsCollector:
    """Collects and exposes network metrics from real capture data."""

    def __init__(self, flow_analyzer):
        self.flow_analyzer = flow_analyzer
        self._lock = threading.Lock()
        self._monitoring = False
        self._start_time = None
        # Traffic chart history (RX/TX approximation from byte rate)
        self._chart_history = []
        self._max_chart_points = 60

    def start_monitoring(self):
        """Mark monitoring as active."""
        with self._lock:
            self._monitoring = True
            self._start_time = time.time()

    def stop_monitoring(self):
        """Mark monitoring as paused."""
        with self._lock:
            self._monitoring = False

    @property
    def is_monitoring(self) -> bool:
        with self._lock:
            return self._monitoring

    def record_chart_point(self, rx_mbps: float, tx_mbps: float):
        """Record a data point for the traffic chart."""
        with self._lock:
            self._chart_history.append({
                "time": time.strftime("%H:%M:%S"),
                "rxMbps": round(rx_mbps, 2),
                "txMbps": round(tx_mbps, 2),
            })
            if len(self._chart_history) > self._max_chart_points:
                self._chart_history = self._chart_history[-self._max_chart_points:]

    def get_chart_data(self) -> list:
        """Return traffic chart history."""
        with self._lock:
            return list(self._chart_history)

    def get_metrics(self) -> dict:
        """Return current network metrics from real data."""
        stats = self.flow_analyzer.get_stats()
        with self._lock:
            return {
                "packets": stats["total_packets"],
                "packets_per_second": stats["packets_per_second"],
                "flows": stats["active_flows"],
                "bandwidth_mbps": stats["bandwidth_mbps"],
                "latency_ms": None,  # Will be filled from TCP server RTT
                "protocols": stats.get("protocols", {}),
                "is_monitoring": self._monitoring,
                "capture_active": self._monitoring,
            }

    def get_uptime(self) -> float:
        """Return monitoring uptime in seconds."""
        with self._lock:
            if self._start_time and self._monitoring:
                return time.time() - self._start_time
            return 0.0
