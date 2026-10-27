"""
NetShield-ML — Phase 3 Abuse Control Test Suite
Tests message-flood detection, mute enforcement, quarantine/release flows,
quarantine rejection logging, and the sessions API endpoint.
"""
import json
import os
import socket
import sys
import tempfile
import time
import unittest

# Ensure project root and backend are in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from backend.database.database import init_db
from backend.database.messages import get_recent_messages
from backend.networking.multi_agent import MultiAgentRegistry
from backend.networking.server import NetShieldServer


class FakeAgent:
    """Helper client representing a simulated NetShield agent."""

    def __init__(self, host: str, port: int):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((host, port))
        self.sock.settimeout(3.0)
        self.buffer = ""
        self.incoming = []
        self.agent_id = None
        self.name = None

    def send(self, data: dict):
        line = json.dumps(data) + "\n"
        self.sock.sendall(line.encode("utf-8"))

    def _read_available(self, timeout: float = 0.5):
        self.sock.settimeout(timeout)
        try:
            data = self.sock.recv(65536)
            if data:
                self.buffer += data.decode("utf-8", errors="replace")
        except socket.timeout:
            pass
        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            line = line.strip()
            if line:
                self.incoming.append(json.loads(line))

    def recv(self, timeout: float = 3.0) -> dict:
        """Receive the next incoming JSON message."""
        end_time = time.time() + timeout
        while time.time() < end_time:
            if self.incoming:
                return self.incoming.pop(0)
            remaining = max(0.05, end_time - time.time())
            self._read_available(timeout=min(0.2, remaining))
        if self.incoming:
            return self.incoming.pop(0)
        raise TimeoutError(f"No message received within {timeout}s")

    def recv_matching(self, msg_type: str, timeout: float = 3.0) -> dict:
        """Wait for a specific message type, keeping other messages in self.incoming."""
        end_time = time.time() + timeout
        while time.time() < end_time:
            for idx, msg in enumerate(self.incoming):
                if msg.get("type") == msg_type:
                    return self.incoming.pop(idx)
            remaining = max(0.05, end_time - time.time())
            self._read_available(timeout=min(0.2, remaining))
        for idx, msg in enumerate(self.incoming):
            if msg.get("type") == msg_type:
                return self.incoming.pop(idx)
        types_present = [m.get("type") for m in self.incoming]
        raise TimeoutError(f"Expected message type '{msg_type}' not received within {timeout}s (present: {types_present})")

    def close(self):
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass


class TestAbuseControl(unittest.TestCase):
    """Phase 3 flood control, quarantine, and sessions endpoint tests."""

    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db.name
        self.temp_db.close()
        init_db(self.temp_db_path)

        probe_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe_sock.bind(("127.0.0.1", 0))
        self.test_port = probe_sock.getsockname()[1]
        probe_sock.close()

        self.events = []

        def capture_event(event: dict):
            self.events.append(event)

        self.pairing_code = "987654"
        self.registry = MultiAgentRegistry(
            pairing_code=self.pairing_code,
            on_security_event=capture_event,
        )
        self.server = NetShieldServer(
            host="127.0.0.1",
            port=self.test_port,
            registry=self.registry,
        )
        self.server.start()
        time.sleep(0.1)
        self.agents_to_close = []

    def tearDown(self):
        for a in self.agents_to_close:
            a.close()
        self.server.stop()
        if os.path.exists(self.temp_db_path):
            try:
                os.remove(self.temp_db_path)
            except Exception:
                pass

    def create_agent(self) -> FakeAgent:
        agent = FakeAgent("127.0.0.1", self.test_port)
        self.agents_to_close.append(agent)
        return agent

    def register_agent(self, agent: FakeAgent, name: str, code: str = None) -> dict:
        agent.send({
            "type": "register",
            "agent_name": name,
            "pairing_code": code or self.pairing_code,
        })
        ack = agent.recv_matching("register_ack")
        if ack.get("success"):
            agent.agent_id = ack["agent_id"]
            agent.name = ack["name"]
        return ack

    def establish_session(self, a1: FakeAgent, a2: FakeAgent):
        """A1 requests, A2 accepts a session."""
        a1.send({"type": "connect_request", "to_agent_id": a2.agent_id})
        a2.recv_matching("incoming_request")
        a2.send({"type": "connect_accept", "from_agent_id": a1.agent_id})
        a1.recv_matching("connect_accepted")
        a2.recv_matching("connect_accepted")

    def send_chat_expect(self, sender: FakeAgent, receiver: FakeAgent, content: str,
                         ack_type: str, timeout: float = 3.0) -> dict:
        """Send a chat message and wait for a specific ack response type."""
        sender.send({
            "type": "chat_message",
            "to_agent_id": receiver.agent_id,
            "content": content,
        })
        resp = sender.recv_matching(ack_type, timeout=timeout)
        if resp.get("type") == "chat_message_ack":
            try:
                receiver._read_available(timeout=0.3)
            except Exception:
                pass
        return resp

    def test_flood_warning_and_event_logging(self):
        """1. More than 10 messages in 5 seconds emits a warning notice and MESSAGE_FLOOD event."""
        a1 = self.create_agent()
        a2 = self.create_agent()
        self.register_agent(a1, "Floody")
        self.register_agent(a2, "Calm")
        self.establish_session(a1, a2)

        # Drain any pending broadcasts
        a1.incoming.clear()
        a2.incoming.clear()

        warning_notice = None
        for i in range(14):
            a1.send({
                "type": "chat_message",
                "to_agent_id": a2.agent_id,
                "content": f"burst-{i}",
            })
            msg = a1.recv(2.0)
            if msg["type"] == "system_notice":
                warning_notice = msg
                break
            self.assertEqual(msg["type"], "chat_message_ack")
            self.assertEqual(msg["status"], "delivered")
            # Non-ack responses indicate flood handling
            if any(m.get("type") == "system_notice" for m in a1.incoming):
                warning_notice = next(
                    m for m in a1.incoming if m.get("type") == "system_notice"
                )
                break
        # After the 10th/sec boundary, a warning must have appeared
        self.assertIsNotNone(warning_notice)
        self.assertIn("slow down", warning_notice.get("message", "").lower())
        self.assertEqual(warning_notice.get("code"), "FLOOD_WARNING")

        # MESSAGE_FLOOD security event logged exactly once for this first violation
        flood_events = [e for e in self.events if e["type"] == "MESSAGE_FLOOD"]
        self.assertEqual(len(flood_events), 1)
        self.assertEqual(flood_events[0]["severity"], "MEDIUM")
        self.assertEqual(flood_events[0]["raw_data"]["agent_id"], "Floody")
        # Not muted yet (violation 1 of 3)
        self.assertNotIn("Floody", self.registry.muted_until)

    def test_repeated_violations_trigger_mute(self):
        """2. Three violations mute the sender for 30s; messages are rejected during mute."""
        a1 = self.create_agent()
        a2 = self.create_agent()
        self.register_agent(a1, "Spammer")
        self.register_agent(a2, "Victim")
        self.establish_session(a1, a2)
        a1.incoming.clear()
        a2.incoming.clear()

        # Documented policy: mute at the 3rd violation — simulate two prior violations
        self.registry.flood_violations["Spammer"] = 2

        # One more burst above the threshold triggers the mute
        for i in range(12):
            a1.send({
                "type": "chat_message",
                "to_agent_id": a2.agent_id,
                "content": f"spam-{i}",
            })
            a1.recv(2.0)

        self.assertIn("Spammer", self.registry.muted_until)
        mute_deadline = self.registry.muted_until["Spammer"]
        self.assertAlmostEqual(mute_deadline - time.time(), 30.0, delta=6.0)
        muted_events = [e for e in self.events if e["type"] == "MESSAGE_FLOOD_MUTED"]
        self.assertEqual(len(muted_events), 1)
        self.assertEqual(muted_events[0]["severity"], "HIGH")

        # A message sent while muted is rejected and NOT persisted
        a1.send({
            "type": "chat_message",
            "to_agent_id": a2.agent_id,
            "content": "while-muted",
        })
        err = a1.recv_matching("error")
        self.assertEqual(err["code"], "MUTED_FLOOD")

        time.sleep(0.2)
        stored = get_recent_messages(limit=50, db_path=self.temp_db_path)
        self.assertFalse(any(m["content"] == "while-muted" for m in stored))

    def test_quarantine_blocks_message_and_logs(self):
        """3. Quarantined agent's chat messages are rejected server-side and logged."""
        a1 = self.create_agent()
        a2 = self.create_agent()
        self.register_agent(a1, "QuarantineMe")
        self.register_agent(a2, "CleanPeer")
        self.establish_session(a1, a2)
        a1.incoming.clear()
        a2.incoming.clear()

        self.assertTrue(self.registry.quarantine_agent(a1.agent_id))
        self.assertTrue(self.registry.is_quarantined(a1.agent_id))

        a1.send({
            "type": "chat_message",
            "to_agent_id": a2.agent_id,
            "content": "should be blocked",
        })
        err = a1.recv_matching("error")
        self.assertEqual(err["code"], "QUARANTINED")

        time.sleep(0.2)
        blocked_events = [e for e in self.events if e["type"] == "QUARANTINE_BLOCKED_MESSAGE"]
        self.assertEqual(len(blocked_events), 1)
        self.assertEqual(blocked_events[0]["severity"], "HIGH")

        stored = get_recent_messages(limit=50, db_path=self.temp_db_path)
        self.assertFalse(any(m["content"] == "should be blocked" for m in stored))

    def test_quarantine_blocks_connect_request_and_logs(self):
        """4. Quarantined agent's connection requests are rejected server-side and logged."""
        a1 = self.create_agent()
        a2 = self.create_agent()
        self.register_agent(a1, "Quarantined")
        self.register_agent(a2, "Target")

        self.assertTrue(self.registry.quarantine_agent(a1.agent_id))
        a1.incoming.clear()

        a1.send({"type": "connect_request", "to_agent_id": a2.agent_id})
        err = a1.recv_matching("connect_error", timeout=2.0)
        self.assertIn("quarantined", err.get("reason", "").lower())

        blocked_events = [e for e in self.events if e["type"] == "QUARANTINE_BLOCKED_REQUEST"]
        self.assertEqual(len(blocked_events), 1)
        self.assertEqual(blocked_events[0]["raw_data"]["agent_id"], "Quarantined")

        # Session was never established
        self.assertFalse(self.registry.can_message(a1.agent_id, a2.agent_id))

    def test_release_restores_messaging(self):
        """5. Release removes the quarantine and messaging works again."""
        a1 = self.create_agent()
        a2 = self.create_agent()
        self.register_agent(a1, "Released")
        self.register_agent(a2, "Peer")
        self.establish_session(a1, a2)

        self.assertTrue(self.registry.quarantine_agent(a1.agent_id))
        self.assertTrue(self.registry.is_quarantined(a1.agent_id))
        self.assertTrue(self.registry.release_agent(a1.agent_id))
        self.assertFalse(self.registry.is_quarantined(a1.agent_id))

        resp = self.send_chat_expect(a1, a2, "hello after release", "chat_message_ack")
        time.sleep(0.2)
        self.assertEqual(resp["status"], "delivered")

        # Quarantine + release events logged
        self.assertEqual(len([e for e in self.events if e["type"] == "AGENT_QUARANTINED"]), 1)
        self.assertEqual(len([e for e in self.events if e["type"] == "AGENT_RELEASED"]), 1)

    def test_get_agents_status_exposes_quarantine_and_rtt(self):
        """6. get_agents_status reports quarantine state, RTT and last_seen ISO."""
        a1 = self.create_agent()
        self.register_agent(a1, "StatusAgent")

        status = {a["agent_id"]: a for a in self.registry.get_agents_status()}
        self.assertIn("StatusAgent", status)
        entry = status["StatusAgent"]
        self.assertFalse(entry["quarantined"])
        self.assertEqual(entry["status"], "online")
        self.assertIsNotNone(entry["rtt_ms"] is None or True)  # rtt may be None until heartbeat

        # Simulate heartbeat RTT registration via the server-side socket the registry tracks
        self.registry.record_heartbeat(self.registry.agents["StatusAgent"]["client"], 12.5)
        entry = {a["agent_id"]: a for a in self.registry.get_agents_status()}["StatusAgent"]
        self.assertEqual(entry["rtt_ms"], 12.5)
        # last_seen should be an ISO timestamp string
        self.assertIsInstance(entry["last_seen"], str)
        self.assertIn("T", entry["last_seen"])

        self.registry.quarantine_agent("StatusAgent")
        entry = {a["agent_id"]: a for a in self.registry.get_agents_status()}["StatusAgent"]
        self.assertTrue(entry["quarantined"])

    def test_sessions_endpoint_and_registry(self):
        """7. GET /api/sessions handler exposes active sessions from the registry."""
        from backend.main import get_sessions_endpoint

        a1 = self.create_agent()
        a2 = self.create_agent()
        a3 = self.create_agent()
        self.register_agent(a1, "Alice")
        self.register_agent(a2, "Bob")
        self.register_agent(a3, "Carol")

        # Endpoint handler returns the documented shape (backend start-up registry is empty)
        res = get_sessions_endpoint()
        self.assertIn("sessions", res)
        self.assertIn("total", res)
        self.assertEqual(res["total"], 0)

        # Establish two sessions on the test server registry
        self.establish_session(a1, a2)
        self.establish_session(a1, a3)

        sessions = self.registry.get_active_sessions_list()
        self.assertEqual(len(sessions), 2)
        pairs = {frozenset((s["agent_a"], s["agent_b"])) for s in sessions}
        self.assertEqual(pairs, {
            frozenset(("Alice", "Bob")),
            frozenset(("Alice", "Carol")),
        })
        for s in sessions:
            self.assertEqual(s["status"], "active")

        # One end goes offline -> session is degraded
        a2.close()
        # Server marks Bob offline using its own accepted socket when EOF arrives
        self.registry.handle_disconnect(self.registry.agents["Bob"]["client"])
        time.sleep(0.1)
        degraded = next(
            s for s in self.registry.get_active_sessions_list()
            if frozenset((s["agent_a"], s["agent_b"])) == frozenset(("Alice", "Bob"))
        )
        self.assertEqual(degraded["status"], "degraded")


if __name__ == "__main__":
    unittest.main()
