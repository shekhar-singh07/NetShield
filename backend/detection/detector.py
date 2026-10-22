"""
NetShield-ML — Detection Engine
Orchestrates rule-based detection (and future ML detection).

Architecture:
    DetectionEngine
        ├── RuleBasedDetector  (active)
        └── MLDetector         (future — not loaded)
"""
import threading
import time
import logging

from .features import FeatureExtractor
from .rules import RuleBasedDetector
from .ml_detector import MLDetector

logger = logging.getLogger("netshield.detector")


class DetectionEngine:
    """
    Main detection engine.
    Processes packets, extracts features, and runs hybrid rule-based + ML detectors.
    """

    def __init__(
        self,
        packet_rate_threshold: int = 500,
        port_scan_threshold: int = 15,
        connection_burst_threshold: int = 50,
        on_event=None,
    ):
        self.feature_extractor = FeatureExtractor()
        self.rule_detector = RuleBasedDetector(
            packet_rate_threshold=packet_rate_threshold,
            port_scan_threshold=port_scan_threshold,
            connection_burst_threshold=connection_burst_threshold,
        )
        try:
            self.ml_detector = MLDetector()
            self.ml_model_loaded = self.ml_detector.model is not None
            self.ml_model_name = self.ml_detector.model_name
        except Exception as e:
            logger.warning(f"Could not initialize MLDetector: {e}")
            self.ml_detector = None
            self.ml_model_loaded = False
            self.ml_model_name = None

        self.on_event = on_event  # callback(event_dict)
        self._lock = threading.Lock()
        self._event_count = 0
        self._normal_count = 0
        self._suspicious_count = 0
        self._running = False
        # Track processed count for periodic analysis
        self._packets_since_analysis = 0
        self._analysis_interval = 25  # Run detection every 25 packets

    def start(self):
        """Start the detection engine."""
        self._running = True
        logger.info(f"Detection engine started (mode: Hybrid Rules + {self.ml_model_name or 'None'})")

    def stop(self):
        """Stop the detection engine."""
        self._running = False
        logger.info("Detection engine stopped")

    def process_packet(self, packet: dict):
        """
        Process a single packet through the detection pipeline.
        Called from the packet capture callback.
        """
        if not self._running:
            return

        # Update feature state
        self.feature_extractor.update_from_packet(packet)

        with self._lock:
            self._packets_since_analysis += 1
            self._normal_count += 1

            # Periodic analysis
            if self._packets_since_analysis >= self._analysis_interval:
                self._packets_since_analysis = 0
                self._run_analysis()

    def force_analysis(self):
        """Force immediate feature extraction and detection analysis."""
        with self._lock:
            self._packets_since_analysis = 0
            self._run_analysis()

    def _run_analysis(self):
        """Run detection analysis on accumulated features."""
        all_features = self.feature_extractor.get_all_source_features()

        for features in all_features:
            if features.get("recent_packets", 0) <= 0:
                continue
            detected_types = set()

            # 1. Rule-based detection
            rule_events = self.rule_detector.analyze(features)
            for event in rule_events:
                self._suspicious_count += 1
                self._event_count += 1
                detected_types.add(event.get("type"))
                logger.info(
                    f"[Rule Detection] {event['type']} from {event['source_ip']} — {event['reason']}"
                )
                if self.on_event:
                    self.on_event(event)

            # 2. Machine Learning detection
            if self.ml_detector and self.ml_model_loaded:
                ml_events = self.ml_detector.predict(features)
                for event in ml_events:
                    # Avoid duplicate firing if rule already caught it this tick
                    base_type = event.get("type", "").replace("ML_", "")
                    if base_type in detected_types:
                        continue
                    self._suspicious_count += 1
                    self._event_count += 1
                    logger.info(
                        f"[ML Detection] {event['type']} from {event['source_ip']} — {event['reason']}"
                    )
                    if self.on_event:
                        self.on_event(event)

        # Periodic cleanup
        self.feature_extractor.cleanup()

    def get_status(self) -> dict:
        """Return detection engine status."""
        with self._lock:
            mode = "Hybrid (Rules + ML RandomForest)" if self.ml_model_loaded else "Rule-Based"
            return {
                "running": self._running,
                "mode": mode,
                "ml_model_loaded": self.ml_model_loaded,
                "ml_model_name": self.ml_model_name,
                "total_events": self._event_count,
                "normal_count": self._normal_count,
                "suspicious_count": self._suspicious_count,
                "rules": [
                    "High packet rate → TRAFFIC_SPIKE",
                    "Many unique destination ports → PORT_SCAN_LIKE",
                    "Very high connection rate → CONNECTION_BURST",
                    "Repeated failed connections → REPEATED_CONNECTION_FAILURE",
                    "Multi-feature classification → RandomForest ML Anomaly Detection",
                ],
            }

    def get_counts(self) -> dict:
        """Return normal vs suspicious counts."""
        with self._lock:
            return {
                "normal": self._normal_count,
                "suspicious": self._suspicious_count,
            }
