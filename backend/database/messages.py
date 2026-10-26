"""
NetShield-ML — Database (Messages)
Persistence for inter-agent chat and control messages.
"""
import sqlite3
import threading
from datetime import datetime

_lock = threading.Lock()
_db_path = "netshield.db"


def _ensure_table(conn):
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_agent_id TEXT NOT NULL,
            to_agent_id TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT NOT NULL
        )
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_agents
        ON messages (from_agent_id, to_agent_id)
    """)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_to_status
        ON messages (to_agent_id, status)
    """)
    conn.commit()


def init_messages_table(db_path: str = None):
    """Ensure the messages table exists in the database."""
    global _db_path
    if db_path:
        _db_path = db_path
    with _lock:
        conn = sqlite3.connect(_db_path)
        _ensure_table(conn)
        conn.close()


def store_message(
    from_agent_id: str,
    to_agent_id: str,
    content: str,
    timestamp: str = None,
    status: str = "delivered",
    db_path: str = None,
) -> int:
    """Store an inter-agent message in SQLite and return the new message id."""
    path = db_path or _db_path
    ts = timestamp or datetime.now().isoformat()
    with _lock:
        conn = sqlite3.connect(path)
        _ensure_table(conn)
        c = conn.cursor()
        c.execute(
            """INSERT INTO messages (from_agent_id, to_agent_id, content, timestamp, status)
               VALUES (?, ?, ?, ?, ?)""",
            (from_agent_id, to_agent_id, content, ts, status),
        )
        msg_id = c.lastrowid
        conn.commit()
        conn.close()
        return msg_id


def update_message_status(message_id: int, status: str, db_path: str = None):
    """Update message delivery status (e.g. 'queued' -> 'delivered')."""
    path = db_path or _db_path
    with _lock:
        conn = sqlite3.connect(path)
        c = conn.cursor()
        c.execute("UPDATE messages SET status = ? WHERE id = ?", (status, message_id))
        conn.commit()
        conn.close()


def get_conversation(agent_a: str, agent_b: str, limit: int = 100, db_path: str = None) -> list:
    """Retrieve message history between two agents."""
    path = db_path or _db_path
    with _lock:
        conn = sqlite3.connect(path)
        _ensure_table(conn)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute(
            """SELECT * FROM messages
               WHERE (from_agent_id = ? AND to_agent_id = ?)
                  OR (from_agent_id = ? AND to_agent_id = ?)
               ORDER BY id ASC
               LIMIT ?""",
            (agent_a, agent_b, agent_b, agent_a, limit),
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return rows


def get_queued_messages(to_agent_id: str, db_path: str = None) -> list:
    """Get all queued messages awaiting delivery to a newly connected agent."""
    path = db_path or _db_path
    with _lock:
        conn = sqlite3.connect(path)
        _ensure_table(conn)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute(
            """SELECT * FROM messages
               WHERE to_agent_id = ? AND status = 'queued'
               ORDER BY id ASC""",
            (to_agent_id,),
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return rows


def mark_messages_delivered(message_ids: list, db_path: str = None):
    """Mark a list of message IDs as delivered."""
    if not message_ids:
        return
    path = db_path or _db_path
    with _lock:
        conn = sqlite3.connect(path)
        c = conn.cursor()
        placeholders = ",".join("?" for _ in message_ids)
        c.execute(
            f"UPDATE messages SET status = 'delivered' WHERE id IN ({placeholders})",
            message_ids,
        )
        conn.commit()
        conn.close()


def get_recent_messages(limit: int = 100, db_path: str = None) -> list:
    """Retrieve recent messages across all agents."""
    path = db_path or _db_path
    with _lock:
        conn = sqlite3.connect(path)
        _ensure_table(conn)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute(
            "SELECT * FROM messages ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return rows
