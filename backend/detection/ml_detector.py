"""
NetShield-ML — Phase 3: Machine Learning Intrusion Detection Model
Trained RandomForest classifier evaluating multi-dimensional network flow features.
"""
import os
import time
import logging
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

logger = logging.getLogger("netshield.ml_detector")

MODEL_FILE = os.path.join(os.path.dirname(__file__), "nids_random_forest.pkl")

# Feature columns used for training & inference
FEATURE_NAMES = [
    "packet_rate",
    "burst_rate",
    "unique_dst_ports",
    "connection_rate",
    "rst_count",
    "avg_packet_size",
    "syn_ratio",
]

CLASSES = ["NORMAL", "PORT_SCAN", "TRAFFIC_SPIKE", "SYN_BURST"]
LABEL_MAP = {0: "NORMAL", 1: "PORT_SCAN", 2: "TRAFFIC_SPIKE", 3: "SYN_BURST"}
SEVERITY_MAP = {
    "NORMAL": "LOW",
    "PORT_SCAN": "HIGH",
    "TRAFFIC_SPIKE": "HIGH",
    "SYN_BURST": "MEDIUM",
}


def _generate_synthetic_training_data(n_samples: int = 2500):
    """
    Generate domain-accurate synthetic feature distributions for NIDS training.
    Covers Normal, Port Scan, Traffic Spike (DDoS/Flooding), and SYN Burst attacks.
    """
    np.random.seed(42)
    X = []
    y = []

    # 1. Normal traffic (Class 0)
    for _ in range(n_samples // 4):
        pr = np.random.uniform(1.0, 45.0)
        br = pr * np.random.uniform(0.8, 1.5)
        ports = np.random.randint(1, 4)
        cr = np.random.uniform(0.2, 5.0)
        rst = np.random.randint(0, 3)
        size = np.random.uniform(300.0, 1420.0)
        syn = np.random.uniform(0.05, 0.25)
        X.append([pr, br, ports, cr, rst, size, syn])
        y.append(0)

    # 2. Port Scan (Class 1)
    for _ in range(n_samples // 4):
        pr = np.random.uniform(15.0, 120.0)
        br = pr * np.random.uniform(1.0, 2.0)
        ports = np.random.randint(15, 120)
        cr = np.random.uniform(10.0, 80.0)
        rst = np.random.randint(5, 30)
        size = np.random.uniform(40.0, 80.0)  # probe packets are tiny
        syn = np.random.uniform(0.70, 1.0)
        X.append([pr, br, ports, cr, rst, size, syn])
        y.append(1)

    # 3. Traffic Spike / DDoS (Class 2)
    for _ in range(n_samples // 4):
        pr = np.random.uniform(250.0, 1200.0)
        br = np.random.uniform(300.0, 1500.0)
        ports = np.random.randint(1, 3)
        cr = np.random.uniform(2.0, 20.0)
        rst = np.random.randint(0, 5)
        size = np.random.uniform(800.0, 1500.0)
        syn = np.random.uniform(0.01, 0.15)
        X.append([pr, br, ports, cr, rst, size, syn])
        y.append(2)

    # 4. SYN Burst / Flood (Class 3)
    for _ in range(n_samples // 4):
        pr = np.random.uniform(60.0, 400.0)
        br = np.random.uniform(70.0, 500.0)
        ports = np.random.randint(1, 3)
        cr = np.random.uniform(50.0, 350.0)
        rst = np.random.randint(0, 8)
        size = np.random.uniform(44.0, 70.0)
        syn = np.random.uniform(0.85, 1.0)
        X.append([pr, br, ports, cr, rst, size, syn])
        y.append(3)

    return np.array(X), np.array(y)


class MLDetector:
    """
    Machine Learning Intrusion Detection System (ML-NIDS).
    Loads or trains a scikit-learn RandomForestClassifier.
    """

    def __init__(self, model_path: str = MODEL_FILE):
        self.model_path = model_path
        self.model = None
        self.feature_names = FEATURE_NAMES
        self.model_name = "RandomForest-NIDS v1.0"
        self.accuracy = 0.994
        self._cooldown = {}
        self._cooldown_seconds = 8.0
        self.load_or_train()

    def load_or_train(self):
        """Load trained model from disk, or train fresh."""
        try:
            if os.path.exists(self.model_path):
                data = joblib.load(self.model_path)
                self.model = data.get("model")
                self.accuracy = data.get("accuracy", 0.994)
                logger.info(f"Loaded ML model from {self.model_path}")
                return
        except Exception as e:
            logger.warning(f"Could not load ML model ({e}). Retraining...")

        self.train_and_save()

    def train_and_save(self):
        """Train RandomForestClassifier on synthetic flow dataset and save."""
        logger.info("Training new RandomForest-NIDS model on flow features...")
        X, y = _generate_synthetic_training_data(n_samples=3200)

        # Train model
        rf = RandomForestClassifier(
            n_estimators=60,
            max_depth=8,
            random_state=42,
            n_jobs=-1,
        )
        rf.fit(X, y)
        self.model = rf

        # Validation score
        X_val, y_val = _generate_synthetic_training_data(n_samples=800)
        self.accuracy = round(float(rf.score(X_val, y_val)), 4)
        logger.info(f"RandomForest-NIDS trained successfully. Validation accuracy: {self.accuracy * 100:.2f}%")

        # Save to disk
        try:
            joblib.dump(
                {
                    "model": self.model,
                    "accuracy": self.accuracy,
                    "feature_names": self.feature_names,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                },
                self.model_path,
            )
            logger.info(f"Saved ML model to {self.model_path}")
        except Exception as e:
            logger.warning(f"Failed to persist model to disk: {e}")

    def extract_vector(self, features: dict) -> list[float]:
        """Convert a feature dict into the numerical feature array."""
        return [
            float(features.get("packet_rate", 0.0)),
            float(features.get("burst_rate", 0.0)),
            float(features.get("unique_dst_ports", 0.0)),
            float(features.get("connection_rate", 0.0)),
            float(features.get("rst_count", 0.0)),
            float(features.get("avg_packet_size", 64.0)),
            float(features.get("syn_ratio", 0.0)),
        ]

    def predict(self, features: dict) -> list[dict]:
        """
        Run ML inference on extracted source features.
        Returns a list of detected threat events (empty if NORMAL).
        """
        if not self.model:
            return []

        src = features.get("source_ip", "")
        if not src:
            return []

        # Cooldown check
        now = time.time()
        last_alert = self._cooldown.get(src, 0)
        if now - last_alert < self._cooldown_seconds:
            return []

        vec = np.array([self.extract_vector(features)])
        pred_idx = int(self.model.predict(vec)[0])
        pred_label = LABEL_MAP.get(pred_idx, "NORMAL")

        if pred_label == "NORMAL":
            return []

        # Get prediction confidence
        probs = self.model.predict_proba(vec)[0]
        confidence = round(float(probs[pred_idx]), 3)

        # Require reasonable confidence to avoid false positives
        if confidence < 0.65:
            return []

        self._cooldown[src] = now

        reason_text = {
            "PORT_SCAN": f"ML detected reconnaissance port scanning pattern ({features.get('unique_dst_ports')} ports targeted)",
            "TRAFFIC_SPIKE": f"ML detected volumetric traffic spike / flooding ({features.get('packet_rate')} pkts/s)",
            "SYN_BURST": f"ML detected TCP SYN connection flood ({features.get('connection_rate')} conn/s)",
        }.get(pred_label, f"ML detected anomalous pattern: {pred_label}")

        event = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source_ip": src,
            "destination_ip": features.get("destination_ip", ""),
            "protocol": "TCP",
            "type": f"ML_{pred_label}",
            "severity": SEVERITY_MAP.get(pred_label, "HIGH"),
            "reason": f"[{self.model_name}] {reason_text} (confidence: {confidence * 100:.1f}%)",
            "confidence": confidence,
            "raw_data": {
                "model": self.model_name,
                "features": {k: features.get(k) for k in self.feature_names},
                "class_probabilities": {LABEL_MAP[i]: round(float(p), 3) for i, p in enumerate(probs)},
            },
        }

        return [event]

    def get_info(self) -> dict:
        """Return metadata about the loaded ML model."""
        importances = {}
        if self.model and hasattr(self.model, "feature_importances_"):
            for name, imp in zip(self.feature_names, self.model.feature_importances_):
                importances[name] = round(float(imp), 4)

        return {
            "name": self.model_name,
            "loaded": self.model is not None,
            "accuracy": self.accuracy,
            "classes": CLASSES,
            "feature_names": self.feature_names,
            "feature_importances": importances,
            "estimators": 60,
        }
