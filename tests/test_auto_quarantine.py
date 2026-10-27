"""
NetShield-ML — Automated Quarantine & False Alarm Prevention Test Suite
Tests:
1. Whitelist protection (127.0.0.1, 8.8.8.8, server IP are never auto-quarantined).
2. Low-confidence ML filter (confidence < 0.70 does not cause false alarms).
3. Single isolated traffic blips do not cause false alarms.
4. Hybrid consensus (Rule + ML alert) triggers automated quarantine.
5. Auto-quarantined agent is blocked from sending chat messages.
6. Self-healing cooldown (agent is automatically released when TTL expires).
7. Manual admin release overrides cooldown early.
"""
import json
import os
import socket
import sys
import tempfile
import time
import unittest

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from backend.database.database import init_db
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
        end_time = time.time() + timeout
        while time.time() < end_time:
            self._read_available(timeout=0.2)
            if self.incoming:
                return self.incoming.pop(0)
        return None

    def recv_type(self, msg_type: str, timeout: float = 3.0) -> dict:
        end_time = time.time() + timeout
        while time.time() < end_time:
            self._read_available(timeout=0.2)
            for i, m in enumerate(self.incoming):
                if m.get("type") == msg_type:
                    return self.incoming.pop(i)
        return None

    def drain(self):
        self._read_available(timeout=0.1)
        self.incoming.clear()

    def register(self, pairing_code: str, name: str) -> dict:
        self.name = name
        self.send({
            "type": "register",
            "pairing_code": pairing_code,
            "agent_name": name,
        })
        resp = self.recv()
        if resp and resp.get("success"):
            self.agent_id = resp.get("agent_id")
        return resp

    def close(self):
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass


class TestAutoQuarantine(unittest.TestCase):
    def setUp(self):
        # Ephemeral port
        probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe.bind(("127.0.0.1", 0))
        self.port = probe.getsockname()[1]
        probe.close()

        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self.temp_db.name
        self.temp_db.close()
        init_db(self.db_path)

        self.pairing_code = "SAFE2026"
        self.security_events = []

        def on_event(evt):
            self.security_events.append(evt)

        self.registry = MultiAgentRegistry(
            pairing_code=self.pairing_code,
            on_security_event=on_event,
        )
        self.registry.auto_quarantine_cooldown_seconds = 2.0

        self.server = NetShieldServer(
            host="127.0.0.1",
            port=self.port,
            registry=self.registry,
        )
        self.server.start()
        time.sleep(0.3)

    def tearDown(self):
        try:
            self.registry._sweeper_running = False
        except Exception:
            pass
        self.server.stop()
        time.sleep(0.2)
        try:
            os.remove(self.db_path)
        except Exception:
            pass

    def test_whitelist_protection_never_quarantines(self):
        """DNS 8.8.8.8 and localhost must never trigger auto-quarantine."""
        self.assertTrue(self.registry.is_ip_whitelisted("8.8.8.8"))
        self.assertTrue(self.registry.is_ip_whitelisted("127.0.0.1"))
        self.assertTrue(self.registry.is_ip_whitelisted("1.1.1.1"))

        # Simulate attack alert from 8.8.8.8
        event = {
            "source_ip": "8.8.8.8",
            "type": "PORT_SCAN_LIKE",
            "severity": "HIGH",
            "confidence": 1.0,
            "reason": "Test DNS burst",
        }
        res = self.registry.evaluate_security_event(event)
        self.assertEqual(res, [], "Whitelisted IP must never be auto-quarantined")

    def test_low_confidence_ml_filter_prevents_false_alarm(self):
        """Low confidence ML detections (<0.70) must not cause false alarms."""
        agent = FakeAgent("127.0.0.1", self.port)
        reg = agent.register(self.pairing_code, "TargetAgent")
        self.assertTrue(reg.get("success"))
        aid = reg["agent_id"]

        # Assign simulated non-whitelisted IP
        self.registry.agents[aid]["ip"] = "192.168.1.55"

        # Low-confidence ML alert (0.55)
        evt = {
            "source_ip": "192.168.1.55",
            "type": "ML_PORT_SCAN",
            "severity": "HIGH",
            "confidence": 0.55,
            "reason": "Uncertain ML anomaly",
        }
        res = self.registry.evaluate_security_event(evt)
        self.assertEqual(res, [], "Low-confidence ML alert must not trigger quarantine")
        self.assertFalse(self.registry.is_quarantined(aid))
        agent.close()

    def test_single_blip_does_not_quarantine(self):
        """A single isolated blip without consensus or persistence must not quarantine."""
        agent = FakeAgent("127.0.0.1", self.port)
        reg = agent.register(self.pairing_code, "InnocentAgent")
        self.assertTrue(reg.get("success"))
        aid = reg["agent_id"]
        self.registry.agents[aid]["ip"] = "192.168.1.77"

        # Single rule alert
        evt = {
            "source_ip": "192.168.1.77",
            "type": "TRAFFIC_SPIKE",
            "severity": "HIGH",
            "confidence": 1.0,
            "reason": "Brief traffic burst",
        }
        res = self.registry.evaluate_security_event(evt)
        self.assertEqual(res, [], "Single isolated rule event must not quarantine immediately")
        self.assertFalse(self.registry.is_quarantined(aid))
        agent.close()

    def test_hybrid_consensus_triggers_auto_quarantine_and_blocks_chat(self):
        """Rule alert + ML alert for the same IP (Hybrid Consensus) must auto-quarantine the agent."""
        agent_a = FakeAgent("127.0.0.1", self.port)
        agent_b = FakeAgent("127.0.0.1", self.port)
        reg_a = agent_a.register(self.pairing_code, "BadAgent")
        reg_b = agent_b.register(self.pairing_code, "GoodAgent")
        aid_a = reg_a["agent_id"]
        aid_b = reg_b["agent_id"]

        # Give BadAgent a non-whitelisted IP
        self.registry.agents[aid_a]["ip"] = "192.168.1.99"

        # Establish session between A and B
        agent_a.send({"type": "connect_request", "to_agent_id": aid_b})
        agent_b.recv_type("incoming_request")
        agent_b.send({"type": "connect_accept", "from_agent_id": aid_a})
        agent_a.recv_type("connect_accepted")
        agent_b.recv_type("connect_accepted")

        # Now simulate Rule alert + ML alert on 192.168.1.99
        self.registry.evaluate_security_event({
            "source_ip": "192.168.1.99",
            "type": "PORT_SCAN_LIKE",
            "severity": "HIGH",
            "confidence": 1.0,
            "reason": "Port scan pattern detected by rule",
        })
        res = self.registry.evaluate_security_event({
            "source_ip": "192.168.1.99",
            "type": "ML_PORT_SCAN",
            "severity": "HIGH",
            "confidence": 0.85,
            "reason": "Port scan classified by RandomForest",
        })
        self.assertIn(aid_a, res, "BadAgent must be auto-quarantined on hybrid consensus")
        self.assertTrue(self.registry.is_quarantined(aid_a))

        # Check system notice was sent to agent A
        notice = agent_a.recv_type("system_notice", timeout=1.0)
        self.assertIsNotNone(notice)
        self.assertEqual(notice.get("code"), "AUTO_QUARANTINED")

        # Verify agent A is blocked from sending chat messages
        agent_a.send({"type": "chat_message", "to_agent_id": aid_b, "content": "Hello while quarantined"})
        err = agent_a.recv_type("error", timeout=1.0)
        self.assertIsNotNone(err)
        self.assertEqual(err.get("code"), "QUARANTINED")

        # Check status info exposes quarantine remaining seconds and type
        status_list = self.registry.get_agents_status()
        bad_status = next(s for s in status_list if s["agent_id"] == aid_a)
        self.assertTrue(bad_status["quarantined"])
        self.assertEqual(bad_status["quarantine_type"], "auto")
        self.assertIsNotNone(bad_status["quarantine_remaining_seconds"])

        agent_a.close()
        agent_b.close()

    def test_auto_release_self_healing_after_cooldown(self):
        """Auto-quarantined agent must automatically be released when cooldown expires."""
        agent = FakeAgent("127.0.0.1", self.port)
        reg = agent.register(self.pairing_code, "HealingAgent")
        aid = reg["agent_id"]
        self.registry.agents[aid]["ip"] = "192.168.1.120"

        # Auto-quarantine for 1.2 seconds
        self.registry.auto_quarantine_agent(aid, reason="Test short cooldown", duration_seconds=1.2)
        self.assertTrue(self.registry.is_quarantined(aid))

        # Drain notice
        notice = agent.recv_type("system_notice", timeout=1.0)
        self.assertEqual(notice.get("code"), "AUTO_QUARANTINED")

        # Wait for cooldown to expire + sweeper tick (total 2.0s)
        time.sleep(2.0)

        # Agent should now be self-healed and released
        self.assertFalse(self.registry.is_quarantined(aid), "Agent must auto-release after cooldown expires")

        # Released notice should have arrived
        rel_notice = agent.recv_type("system_notice", timeout=1.0)
        self.assertIsNotNone(rel_notice)
        self.assertEqual(rel_notice.get("code"), "RELEASED")

        agent.close()

    def test_manual_admin_release_overrides_early(self):
        """Admin can release an auto-quarantined agent early."""
        agent = FakeAgent("127.0.0.1", self.port)
        reg = agent.register(self.pairing_code, "EarlyReleaseAgent")
        aid = reg["agent_id"]
        self.registry.agents[aid]["ip"] = "192.168.1.130"

        self.registry.auto_quarantine_agent(aid, reason="Test admin override", duration_seconds=60.0)
        self.assertTrue(self.registry.is_quarantined(aid))

        # Admin clicks Release
        ok = self.registry.release_agent(aid, reason="Admin manual unblock")
        self.assertTrue(ok)
        self.assertFalse(self.registry.is_quarantined(aid))

        agent.close()


if __name__ == "__main__":
    unittest.main()
