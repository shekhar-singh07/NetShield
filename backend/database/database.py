"""
NetShield-ML — Database (SQLite)
Lightweight persistence for security events and device state.
"""
import sqlite3
import threading
import json
from datetime import datetime

_lock = threading.Lock()
_db_path = "netshield.db"


def init_db(path: str = None):
    """Initialize the SQLite database and create tables if they don't exist."""
    global _db_path
    if path:
        _db_path = path
    conn = sqlite3.connect(_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS security_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            source_ip TEXT,
            destination_ip TEXT,
            protocol TEXT,
            type TEXT NOT NULL,
            severity TEXT NOT NULL,
            reason TEXT,
            confidence REAL,
            raw_data TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS flow_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            source_ip TEXT,
            destination_ip TEXT,
            source_port INTEGER,
            destination_port INTEGER,
            protocol TEXT,
            packet_count INTEGER,
            byte_count INTEGER,
            duration REAL
        )
    """)
    conn.commit()
    conn.close()


def store_event(event: dict):
    """Store a security event in the database."""
    with _lock:
        conn = sqlite3.connect(_db_path)
        c = conn.cursor()
        c.execute(
            """INSERT INTO security_events
               (timestamp, source_ip, destination_ip, protocol, type, severity, reason, confidence, raw_data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event.get("timestamp", datetime.now().isoformat()),
                event.get("source_ip", ""),
                event.get("destination_ip", ""),
                event.get("protocol", ""),
                event.get("type", "UNKNOWN"),
                event.get("severity", "LOW"),
                event.get("reason", ""),
                event.get("confidence"),
                json.dumps(event.get("raw_data")) if event.get("raw_data") else None,
            ),
        )
        conn.commit()
        conn.close()


def get_events(limit: int = 100) -> list:
    """Retrieve the most recent security events."""
    with _lock:
        conn = sqlite3.connect(_db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute(
            "SELECT * FROM security_events ORDER BY id DESC LIMIT ?", (limit,)
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return rows


def get_event_counts() -> dict:
    """Get counts of normal vs suspicious events."""
    with _lock:
        conn = sqlite3.connect(_db_path)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM security_events WHERE severity = 'LOW' OR type = 'NORMAL'")
        normal = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM security_events WHERE severity != 'LOW' AND type != 'NORMAL'")
        suspicious = c.fetchone()[0]
        conn.close()
        return {"normal": normal, "suspicious": suspicious}


def clear_events():
    """Clear all security events (for testing)."""
    with _lock:
        conn = sqlite3.connect(_db_path)
        c = conn.cursor()
        c.execute("DELETE FROM security_events")
        conn.commit()
        conn.close()
