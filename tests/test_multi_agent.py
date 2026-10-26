"""
NetShield-ML — Multi-Agent Test Suite
Tests concurrent agent connections, registration, peer discovery, session handshake,
chat relay (online + queued), access control, and pairing code verification.
"""
import json
import os
import queue
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
from backend.database.messages import get_conversation
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
            data = self.sock.recv(4096)
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
        """
        Wait for a specific message type, keeping other incoming messages
        in self.incoming for subsequent calls.
        """
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


class TestMultiAgent(unittest.TestCase):
    """Multi-Agent TCP server and registry test cases."""

    def setUp(self):
        # Temporary DB file
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db_path = self.temp_db.name
        self.temp_db.close()
        init_db(self.temp_db_path)

        # Ephemeral port
        probe_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe_sock.bind(("127.0.0.1", 0))
        self.test_port = probe_sock.getsockname()[1]
        probe_sock.close()

        self.pairing_code = "987654"
        self.registry = MultiAgentRegistry(pairing_code=self.pairing_code)
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

    def test_three_agents_registration_and_peer_broadcast(self):
        """1. Spawns 3 fake agents concurrently connecting to the server."""
        a1 = self.create_agent()
        a2 = self.create_agent()
        a3 = self.create_agent()

        ack1 = self.register_agent(a1, "Agent Alpha")
        self.assertTrue(ack1["success"])
        self.assertEqual(ack1["name"], "Agent Alpha")
        self.assertEqual(ack1["agent_id"], "AgentAlpha")

        ack2 = self.register_agent(a2, "Agent Beta")
        self.assertTrue(ack2["success"])
        self.assertEqual(ack2["agent_id"], "AgentBeta")

        ack3 = self.register_agent(a3, "Agent Gamma")
        self.assertTrue(ack3["success"])
        self.assertEqual(ack3["agent_id"], "AgentGamma")

        # Drain peer_list broadcasts until all 3 peers appear
        peer_list = None
        end_time = time.time() + 3.0
        while time.time() < end_time:
            pl = a1.recv_matching("peer_list", timeout=1.0)
            if len(pl.get("peers", [])) == 3:
                peer_list = pl
                break
        self.assertIsNotNone(peer_list)
        peers = peer_list["peers"]
        self.assertEqual(len(peers), 3)

        agent_ids = {p["agent_id"] for p in peers}
        self.assertEqual(agent_ids, {"AgentAlpha", "AgentBeta", "AgentGamma"})

        # Verify peer list contains NO IPs (security requirement)
        for p in peers:
            self.assertNotIn("ip", p)
            self.assertNotIn("port", p)
            self.assertIn("status", p)
            self.assertEqual(p["status"], "online")

    def test_duplicate_name_handling(self):
        """2. Disambiguates duplicate agent names with numeric suffixes."""
        a1 = self.create_agent()
        a2 = self.create_agent()
        a3 = self.create_agent()

        ack1 = self.register_agent(a1, "Sensor")
        ack2 = self.register_agent(a2, "Sensor")
        ack3 = self.register_agent(a3, "Sensor")

        self.assertTrue(ack1["success"])
        self.assertTrue(ack2["success"])
        self.assertTrue(ack3["success"])

        self.assertEqual(ack1["agent_id"], "Sensor")
        self.assertEqual(ack2["agent_id"], "Sensor-1")
        self.assertEqual(ack3["agent_id"], "Sensor-2")

    def test_invalid_pairing_code_rejection(self):
        """3. Rejects registration when pairing code is invalid."""
        a = self.create_agent()
        ack = self.register_agent(a, "RogueAgent", code="000000")

        self.assertFalse(ack["success"])
        self.assertEqual(ack.get("code"), "AUTH_FAILED")
        self.assertFalse(self.registry.is_registered(a.sock))

    def test_unregistered_client_rejections(self):
        """4. Rejects protected commands from unregistered sockets."""
        a = self.create_agent()

        # Try peer_list_request
        a.send({"type": "peer_list_request"})
        err = a.recv_matching("error")
        self.assertEqual(err.get("code"), "UNAUTHORIZED")

        # Try connect_request
        a.send({"type": "connect_request", "to_agent_id": "AgentBeta"})
        err = a.recv_matching("error")
        self.assertEqual(err.get("code"), "UNAUTHORIZED")

        # Try chat_message
        a.send({"type": "chat_message", "to_agent_id": "AgentBeta", "content": "hello"})
        err = a.recv_matching("error")
        self.assertEqual(err.get("code"), "UNAUTHORIZED")

    def test_session_handshake_accept_and_chat_delivery(self):
        """5. Tests complete handshake accept flow and subsequent chat delivery."""
        a1 = self.create_agent()
        a2 = self.create_agent()

        self.register_agent(a1, "Alice")
        self.register_agent(a2, "Bob")

        # Alice requests session with Bob
        a1.send({"type": "connect_request", "to_agent_id": a2.agent_id})

        # Bob receives incoming request
        incoming = a2.recv_matching("incoming_request")
        self.assertEqual(incoming["from_agent_id"], a1.agent_id)
        self.assertEqual(incoming["from_name"], "Alice")

        # Bob accepts
        a2.send({"type": "connect_accept", "from_agent_id": a1.agent_id})

        # Alice receives connect_accepted
        accepted_a1 = a1.recv_matching("connect_accepted")
        self.assertEqual(accepted_a1["peer_id"], a2.agent_id)

        # Bob receives connect_accepted confirmation
        accepted_a2 = a2.recv_matching("connect_accepted")
        self.assertEqual(accepted_a2["peer_id"], a1.agent_id)

        # Permission check passes
        self.assertTrue(self.registry.can_message(a1.agent_id, a2.agent_id))

        # Alice sends chat message to Bob
        a1.send({
            "type": "chat_message",
            "to_agent_id": a2.agent_id,
            "content": "Alert: Unusual port scan detected",
        })

        # Alice gets delivery ack
        chat_ack = a1.recv_matching("chat_message_ack")
        self.assertEqual(chat_ack["status"], "delivered")

        # Bob receives forwarded chat message
        msg_b = a2.recv_matching("chat_message")
        self.assertEqual(msg_b["from_agent_id"], a1.agent_id)
        self.assertEqual(msg_b["content"], "Alert: Unusual port scan detected")

    def test_session_handshake_decline(self):
        """6. Tests handshake decline flow."""
        a1 = self.create_agent()
        a2 = self.create_agent()

        self.register_agent(a1, "Alice")
        self.register_agent(a2, "Bob")

        a1.send({"type": "connect_request", "to_agent_id": a2.agent_id})
        a2.recv_matching("incoming_request")

        # Bob declines
        a2.send({
            "type": "connect_decline",
            "from_agent_id": a1.agent_id,
            "reason": "Not accepting chats right now",
        })

        declined = a1.recv_matching("connect_declined")
        self.assertEqual(declined["peer_id"], a2.agent_id)
        self.assertEqual(declined["reason"], "Not accepting chats right now")

        # Permission check fails
        self.assertFalse(self.registry.can_message(a1.agent_id, a2.agent_id))

    def test_chat_rejected_without_session(self):
        """7. Tests chat message rejection when session is not established."""
        a1 = self.create_agent()
        a2 = self.create_agent()

        self.register_agent(a1, "Alice")
        self.register_agent(a2, "Bob")

        # Alice attempts to chat without connect handshake
        a1.send({
            "type": "chat_message",
            "to_agent_id": a2.agent_id,
            "content": "Unsolicited message",
        })

        err = a1.recv_matching("error")
        self.assertEqual(err["code"], "NOT_CONNECTED")

    def test_offline_message_queueing_and_delivery_on_reconnect(self):
        """8. Tests queueing offline messages and delivering when recipient reconnects."""
        a1 = self.create_agent()
        a2 = self.create_agent()

        self.register_agent(a1, "Alice")
        self.register_agent(a2, "Bob")

        # Establish session first
        a1.send({"type": "connect_request", "to_agent_id": a2.agent_id})
        a2.recv_matching("incoming_request")
        a2.send({"type": "connect_accept", "from_agent_id": a1.agent_id})
        a1.recv_matching("connect_accepted")
        a2.recv_matching("connect_accepted")

        # Bob disconnects
        bob_id = a2.agent_id
        a2.close()
        time.sleep(0.2)

        # Drain peer_list broadcast until Bob is shown offline
        end_time = time.time() + 3.0
        bob_peer = None
        while time.time() < end_time:
            p_list = a1.recv_matching("peer_list", timeout=1.0)
            peer = next((p for p in p_list.get("peers", []) if p["agent_id"] == bob_id), None)
            if peer and peer["status"] == "offline":
                bob_peer = peer
                break
        self.assertIsNotNone(bob_peer)
        self.assertEqual(bob_peer["status"], "offline")

        # Alice sends message while Bob is offline
        a1.send({
            "type": "chat_message",
            "to_agent_id": bob_id,
            "content": "Message sent while offline",
        })

        # Alice receives status='queued'
        ack = a1.recv_matching("chat_message_ack")
        self.assertEqual(ack["status"], "queued")

        # Bob reconnects with the same name
        bob_new = self.create_agent()
        ack_bob = self.register_agent(bob_new, "Bob")
        self.assertTrue(ack_bob["success"])
        self.assertEqual(ack_bob["agent_id"], bob_id)

        # Bob receives the queued message upon reconnect
        delivered_msg = bob_new.recv_matching("chat_message")
        self.assertEqual(delivered_msg["content"], "Message sent while offline")
        self.assertTrue(delivered_msg.get("queued"))

    def test_connect_request_to_offline_agent(self):
        """9. Rejects connect_request to offline or non-existent peer."""
        a1 = self.create_agent()
        self.register_agent(a1, "Alice")

        a1.send({"type": "connect_request", "to_agent_id": "NonExistentAgent"})
        resp = a1.recv_matching("connect_error")
        self.assertEqual(resp["reason"], "offline")

    def test_database_messages_and_api_handlers(self):
        """10. Tests persistence in messages table and HTTP API query functions."""
        from backend.database.messages import (
            store_message,
            get_conversation,
            get_recent_messages,
            get_queued_messages,
            mark_messages_delivered,
        )
        from backend.main import get_agents, get_messages_endpoint

        # Test storing delivered and queued messages
        m1 = store_message("Alpha", "Beta", "Hello Beta", status="delivered", db_path=self.temp_db_path)
        m2 = store_message("Beta", "Alpha", "Hey Alpha", status="delivered", db_path=self.temp_db_path)
        m3 = store_message("Gamma", "Beta", "Gamma to Beta", status="queued", db_path=self.temp_db_path)

        self.assertIsInstance(m1, int)
        self.assertIsInstance(m2, int)
        self.assertIsInstance(m3, int)

        # Test conversation query
        conv = get_conversation("Alpha", "Beta", db_path=self.temp_db_path)
        self.assertEqual(len(conv), 2)
        self.assertEqual(conv[0]["content"], "Hello Beta")
        self.assertEqual(conv[1]["content"], "Hey Alpha")

        # Test queued messages query
        queued = get_queued_messages("Beta", db_path=self.temp_db_path)
        self.assertEqual(len(queued), 1)
        self.assertEqual(queued[0]["content"], "Gamma to Beta")

        # Test mark delivered
        mark_messages_delivered([m3], db_path=self.temp_db_path)
        queued_after = get_queued_messages("Beta", db_path=self.temp_db_path)
        self.assertEqual(len(queued_after), 0)

        # Test recent messages
        recent = get_recent_messages(limit=10, db_path=self.temp_db_path)
        self.assertEqual(len(recent), 3)

        # Test endpoint handlers
        api_res = get_messages_endpoint(agent_a="Alpha", agent_b="Beta")
        self.assertIn("messages", api_res)
        self.assertIn("count", api_res)

        agents_res = get_agents()
        self.assertIn("agents", agents_res)
        self.assertIn("total", agents_res)


if __name__ == "__main__":
    unittest.main()
