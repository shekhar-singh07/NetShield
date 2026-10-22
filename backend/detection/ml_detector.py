"""
NetShield-ML — real-dataset network-flow classifier.

The runtime detector consumes the same seven flow features produced by
FeatureExtractor. Training accepts CIC-IDS2017-style CSV files and derives
those features from each labelled flow. Synthetic training is intentionally
not supported.
"""
import csv
import glob
import logging
import math
import os
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

logger = logging.getLogger("netshield.ml_detector")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_FILE = os.getenv(
    "NETSHIELD_MODEL_PATH",
    str(Path(__file__).resolve().with_name("nids_random_forest.pkl")),
)
DATASET_PATH = os.getenv(
    "NETSHIELD_DATASET_PATH",
    str(PROJECT_ROOT / "datasets" / "CICIDS2017"),
)

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
SEVERITY_MAP = {
    "NORMAL": "LOW",
    "PORT_SCAN": "HIGH",
    "TRAFFIC_SPIKE": "HIGH",
    "SYN_BURST": "MEDIUM",
}
MODEL_SCHEMA_VERSION = 2


def _normalise_header(value: str) -> str:
    return " ".join(value.replace("\ufeff", "").strip().lower().split())


def _value(row: dict, *names: str) -> str:
    for name in names:
        value = row.get(_normalise_header(name), "")
        if value not in ("", None):
            return str(value).strip()
    return ""


def _number(value: str, default: float = 0.0) -> float:
    try:
        parsed = float(str(value).replace(",", "").strip())
        return parsed if math.isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def _label(value: str) -> str | None:
    label = value.strip().upper().replace("-", "_").replace(" ", "_")
    if not label:
        return None
    if label in {"BENIGN", "NORMAL", "NORMAL_TRAFFIC"}:
        return "NORMAL"
    if "PORTSCAN" in label or "PORT_SCAN" in label:
        return "PORT_SCAN"
    if "SYN" in label and ("FLOOD" in label or "DOS" in label):
        return "SYN_BURST"
    if any(token in label for token in (
        "DOS", "DDOS", "HULK", "GOLDENEYE", "SLOWLORIS", "SLOWHTTP",
        "LOIC", "HOIC", "FLOOD",
    )):
        return "TRAFFIC_SPIKE"
    return None


NSL_KDD_COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "hot", "num_failed_logins",
    "logged_in", "num_compromised", "root_shell", "su_attempted", "num_root",
    "num_file_creations", "num_shells", "num_access_files", "num_outbound_cmds",
    "is_host_login", "is_guest_login", "count", "srv_count", "serror_rate",
    "srv_serror_rate", "rerror_rate", "srv_rerror_rate", "same_srv_rate",
    "diff_srv_rate", "srv_diff_host_rate", "dst_host_count", "dst_host_srv_count",
    "dst_host_same_srv_rate", "dst_host_diff_srv_rate",
    "dst_host_same_src_port_rate", "dst_host_srv_diff_host_rate",
    "dst_host_serror_rate", "dst_host_srv_serror_rate", "dst_host_rerror_rate",
    "dst_host_srv_rerror_rate", "label", "difficulty",
]


def _nsl_label(value: str) -> str | None:
    label = value.strip().lower().rstrip(".")
    if label == "normal":
        return "NORMAL"
    if label in {"ipsweep", "nmap", "portsweep", "satan", "mscan", "saint"}:
        return "PORT_SCAN"
    if label in {
        "back", "land", "neptune", "pod", "smurf", "teardrop", "apache2",
        "mailbomb", "processtable", "udpstorm", "ipsweep", "worm",
    }:
        return "TRAFFIC_SPIKE"
    return None


def _nsl_row_to_training_sample(values: list[str]) -> tuple[list[float], str] | None:
    if len(values) < len(NSL_KDD_COLUMNS):
        return None
    row = dict(zip(NSL_KDD_COLUMNS, values))
    label = _nsl_label(row["label"])
    if label is None:
        return None
    duration = _number(row["duration"])
    count = _number(row["count"])
    packet_rate = count / max(duration, 1.0)
    syn_ratio = 1.0 if row["flag"] in {"S0", "S1", "S2", "S3"} else 0.0
    rst_count = count if row["flag"] in {"REJ", "RSTO", "RSTR"} else 0.0
    unique_ports = max(1.0, count * _number(row["diff_srv_rate"]))
    average_size = (
        _number(row["src_bytes"]) + _number(row["dst_bytes"])
    ) / max(count, 1.0)
    return [
        packet_rate,
        packet_rate,
        unique_ports,
        count / max(duration, 1.0),
        rst_count,
        average_size,
        syn_ratio,
    ], label


def _row_to_training_sample(
    row: dict, unique_dst_ports: float | None = None
) -> tuple[list[float], str] | None:
    duration_us = _number(_value(row, "Flow Duration"))
    duration = duration_us / 1_000_000 if duration_us > 0 else _number(
        _value(row, "Duration", "duration")
    )
    total_packets = _number(_value(row, "Total Fwd Packets")) + _number(
        _value(row, "Total Backward Packets")
    )
    flow_packets_per_second = _number(_value(row, "Flow Packets/s"))
    packet_rate = flow_packets_per_second or (
        total_packets / duration if duration > 0 else 0.0
    )
    burst_rate = flow_packets_per_second or packet_rate
    syn_count = _number(_value(row, "SYN Flag Count"))
    rst_count = _number(_value(row, "RST Flag Count"))
    connection_rate = syn_count / duration if duration > 0 else 0.0
    average_size = _number(_value(row, "Average Packet Size"))
    if not average_size:
        total_length = _number(_value(row, "Total Length of Fwd Packets")) + _number(
            _value(row, "Total Length of Bwd Packets")
        )
        average_size = total_length / total_packets if total_packets else 0.0
    syn_ratio = syn_count / total_packets if total_packets else 0.0
    label = _label(_value(row, "Label", "Class", "Attack"))
    values = [
        packet_rate,
        burst_rate,
        unique_dst_ports if unique_dst_ports is not None else 1.0,
        connection_rate,
        rst_count,
        average_size,
        syn_ratio,
    ]
    if label is None or not all(math.isfinite(value) for value in values):
        return None
    return values, label


def _dataset_files(dataset_path: str) -> list[str]:
    path = Path(dataset_path)
    if path.is_file():
        return [str(path)]
    if path.is_dir():
        return sorted(glob.glob(str(path / "*.csv")))
    return []


def load_real_dataset(dataset_path: str = DATASET_PATH) -> tuple[np.ndarray, np.ndarray, dict]:
    """Load labelled CIC-IDS-style CSV flow files into the model feature schema."""
    files = _dataset_files(dataset_path)
    if not files:
        raise FileNotFoundError(
            f"No CSV dataset found at {dataset_path}. "
            "Set NETSHIELD_DATASET_PATH to a CSV file or directory."
        )

    samples: list[list[float]] = []
    labels: list[str] = []
    source_rows = 0
    skipped_rows = 0
    source_labels: dict[str, int] = {}
    for filename in files:
        if Path(filename).name.lower().startswith("kdd") or "nsl" in filename.lower():
            with open(filename, "r", encoding="utf-8", newline="") as handle:
                for line in handle:
                    source_rows += 1
                    sample = _nsl_row_to_training_sample(
                        [part.strip() for part in line.split(",")]
                    )
                    if sample is None:
                        skipped_rows += 1
                        continue
                    features, label = sample
                    samples.append(features)
                    labels.append(label)
                    source_label = line.split(",")[-2].strip().upper()
                    source_labels[source_label] = source_labels.get(source_label, 0) + 1
            continue
        with open(filename, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                continue
            rows = [
                {
                    _normalise_header(k): (v or "").strip()
                    for k, v in raw_row.items()
                }
                for raw_row in reader
            ]
            ports_by_source: dict[str, set[str]] = {}
            for row in rows:
                source = _value(row, "Source IP", "Src IP", "source_ip")
                port = _value(row, "Destination Port", "Dst Port", "destination_port")
                if source and port:
                    ports_by_source.setdefault(source, set()).add(port)
            for row in rows:
                source_rows += 1
                source = _value(row, "Source IP", "Src IP", "source_ip")
                unique_ports = len(ports_by_source.get(source, set())) or 1
                sample = _row_to_training_sample(row, unique_ports)
                if sample is None:
                    skipped_rows += 1
                    continue
                features, label = sample
                samples.append(features)
                labels.append(label)
                source_label = _value(row, "Label", "Class", "Attack").upper()
                source_labels[source_label] = source_labels.get(source_label, 0) + 1

    if not samples:
        raise ValueError(
            f"No usable labelled rows were found in {dataset_path}. "
            "Expected CIC-IDS-style flow columns and a Label column."
        )
    class_counts = {label: labels.count(label) for label in sorted(set(labels))}
    if len(class_counts) < 2:
        raise ValueError("The real dataset must contain at least two supported classes.")
    metadata = {
        "training_source": "real_dataset",
        "dataset_path": os.path.abspath(dataset_path),
        "dataset_files": [os.path.abspath(filename) for filename in files],
        "source_rows": source_rows,
        "usable_rows": len(samples),
        "skipped_rows": skipped_rows,
        "class_counts": class_counts,
        "source_labels": source_labels,
    }
    return np.asarray(samples, dtype=float), np.asarray(labels), metadata


class MLDetector:
    """Random Forest classifier trained only from labelled real flow data."""

    def __init__(self, model_path: str = MODEL_FILE, dataset_path: str = DATASET_PATH):
        self.model_path = model_path
        self.dataset_path = dataset_path
        self.model = None
        self.feature_names = FEATURE_NAMES
        self.model_name = "RandomForest-NIDS v2.0 (real dataset)"
        self.accuracy = None
        self.training_metadata: dict = {}
        self._cooldown = {}
        self._cooldown_seconds = 8.0
        self.load_or_train()

    def load_or_train(self):
        """Load a compatible real-data model, or train if configured data exists."""
        if os.path.exists(self.model_path):
            try:
                data = joblib.load(self.model_path)
                if (
                    data.get("training_source") == "real_dataset"
                    and data.get("feature_names") == self.feature_names
                ):
                    self.model = data["model"]
                    self.accuracy = data.get("accuracy")
                    self.training_metadata = data.get("training_metadata", {})
                    logger.info("Loaded real-data ML model from %s", self.model_path)
                    return
                logger.warning("Ignoring model without real-dataset provenance: %s", self.model_path)
            except Exception as exc:
                logger.warning("Could not load ML model (%s).", exc)

        if _dataset_files(self.dataset_path):
            self.train_and_save()
        else:
            logger.warning(
                "ML model unavailable: no real dataset configured at %s. "
                "Rules remain active.",
                self.dataset_path,
            )

    def train_and_save(self, dataset_path: str | None = None):
        """Train and persist a Random Forest from real labelled flow CSV data."""
        source = dataset_path or self.dataset_path
        X, y, metadata = load_real_dataset(source)
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        model = RandomForestClassifier(
            n_estimators=100,
            max_depth=16,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X_train, y_train)
        self.model = model
        self.accuracy = round(float(model.score(X_val, y_val)), 4)
        self.training_metadata = metadata
        payload = {
            "model": self.model,
            "accuracy": self.accuracy,
            "feature_names": self.feature_names,
            "training_source": "real_dataset",
            "training_metadata": metadata,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        Path(self.model_path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(payload, self.model_path)
        logger.info(
            "Trained real-data model: %s usable rows, validation accuracy %.2f%%",
            metadata["usable_rows"],
            self.accuracy * 100,
        )

    def extract_vector(self, features: dict) -> list[float]:
        return [float(features.get(name, 0.0)) for name in self.feature_names]

    def predict(self, features: dict) -> list[dict]:
        if self.model is None:
            return []
        src = features.get("source_ip", "")
        if not src:
            return []
        if features.get("recent_packets", 0) <= 0:
            return []
        now = time.time()
        if now - self._cooldown.get(src, 0) < self._cooldown_seconds:
            return []
        vec = np.asarray([self.extract_vector(features)])
        pred_label = str(self.model.predict(vec)[0])
        probabilities = self.model.predict_proba(vec)[0]
        classes = [str(value) for value in self.model.classes_]
        pred_index = classes.index(pred_label)
        confidence = round(float(probabilities[pred_index]), 3)
        calibration = None

        # NSL-KDD does not expose packet size, so its byte-derived training
        # feature is not directly comparable to live packet sizes. Keep the
        # model's confident predictions, but calibrate clear runtime patterns
        # when that incompatible feature causes a NORMAL prediction.
        if pred_label == "NORMAL":
            pred_label, calibration = self._calibrate_runtime_pattern(features)
            if pred_label is None:
                return []
            confidence = max(confidence, 0.65)

        if confidence < 0.65:
            return []
        self._cooldown[src] = now
        reason_text = {
            "PORT_SCAN": f"ML detected reconnaissance port scanning pattern ({features.get('unique_dst_ports')} ports targeted)",
            "TRAFFIC_SPIKE": f"ML detected volumetric traffic spike / flooding ({features.get('packet_rate')} pkts/s)",
            "SYN_BURST": f"ML detected TCP SYN connection flood ({features.get('connection_rate')} conn/s)",
        }.get(pred_label, f"ML detected anomalous pattern: {pred_label}")
        return [{
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
                "calibration": calibration,
                "features": {key: features.get(key) for key in self.feature_names},
                "class_probabilities": {
                    label: round(float(probability), 3)
                    for label, probability in zip(classes, probabilities)
                },
            },
        }]

    @staticmethod
    def _calibrate_runtime_pattern(features: dict) -> tuple[str | None, str | None]:
        """Bridge live packet semantics that are absent from NSL-KDD training."""
        if features.get("unique_dst_ports", 0) > 15:
            return "PORT_SCAN", "runtime_port_scan_signature"
        if (
            features.get("packet_rate", 0) > 250
            or features.get("burst_rate", 0) > 250
        ):
            return "TRAFFIC_SPIKE", "runtime_traffic_spike_signature"
        if features.get("connection_rate", 0) > 50:
            return "SYN_BURST", "runtime_connection_burst_signature"
        return None, None

    def get_info(self) -> dict:
        importances = {}
        if self.model is not None and hasattr(self.model, "feature_importances_"):
            importances = {
                name: round(float(importance), 4)
                for name, importance in zip(self.feature_names, self.model.feature_importances_)
            }
        return {
            "name": self.model_name,
            "loaded": self.model is not None,
            "accuracy": self.accuracy or 0.0,
            "classes": [str(value) for value in self.model.classes_] if self.model is not None else [],
            "feature_names": self.feature_names,
            "feature_importances": importances,
            "estimators": getattr(self.model, "n_estimators", 0),
            "training_source": self.training_metadata.get("training_source"),
            "dataset_path": self.training_metadata.get("dataset_path", self.dataset_path),
            "usable_rows": self.training_metadata.get("usable_rows", 0),
            "class_counts": self.training_metadata.get("class_counts", {}),
        }
