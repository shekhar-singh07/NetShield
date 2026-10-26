"""
NetShield-ML — Phase 2 End-to-End Test
Verifies complete agent-side messaging lifecycle:
1. Both agents register with the server successfully.
2. Both agents receive peer lists.
3. Agent A sends a connection request to Agent B.
4. Agent B accepts the request.
5. Both agents receive updated session state.
6. Agent A sends a chat message to Agent B.
7. Agent B receives the message and Agent A receives delivery update.
8. Verifies in-memory state exposed via get_state().
"""
import os
import socket
import sys
import tempfile
import time
import unittest

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.database.database import init_db
from backend.networking.multi_agent import MultiAgentRegistry
from backend.networking.server import NetShieldServer
from agent.agent_client import AgentClient


class TestAgentEndToEnd(unittest.TestCase):
    def setUp(self):
        # Ephemeral port
        probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe.bind(("127.0.0.1", 0))
        self.port = probe.getsockname()[1]
        probe.close()

        # Temporary DB
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self.temp_db.name
        self.temp_db.close()
        init_db(self.db_path)

        self.pairing_code = "E2E999"
        self.registry = MultiAgentRegistry(pairing_code=self.pairing_code)
        self.server = NetShieldServer(
            host="127.0.0.1",
            port=self.port,
            registry=self.registry,
        )
        self.server.start()
        time.sleep(0.15)

        # Temporary config files
        self.cfg_a = tempfile.NamedTemporaryFile(suffix="_a.json", delete=False)
        self.cfg_a_path = self.cfg_a.name
        self.cfg_a.close()

        self.cfg_b = tempfile.NamedTemporaryFile(suffix="_b.json", delete=False)
        self.cfg_b_path = self.cfg_b.name
        self.cfg_b.close()

        self.client_a = None
        self.client_b = None

    def tearDown(self):
        if self.client_a:
            self.client_a.stop()
        if self.client_b:
            self.client_b.stop()
        self.server.stop()

        for p in (self.db_path, self.cfg_a_path, self.cfg_b_path):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

    def test_full_agent_messaging_lifecycle(self):
        # 1. Start Agent A and Agent B
        self.client_a = AgentClient(
            server_host="127.0.0.1",
            server_port=self.port,
            pairing_code=self.pairing_code,
            agent_name="Agent-A",
            config_file=self.cfg_a_path,
            auto_connect=True,
        )

        self.client_b = AgentClient(
            server_host="127.0.0.1",
            server_port=self.port,
            pairing_code=self.pairing_code,
            agent_name="Agent-B",
            config_file=self.cfg_b_path,
            auto_connect=True,
        )

        # Wait up to 3s for both agents to register successfully
        end = time.time() + 3.0
        while time.time() < end:
            if self.client_a.agent_id and self.client_b.agent_id:
                break
            time.sleep(0.1)

        self.assertIsNotNone(self.client_a.agent_id, "Agent A failed to register")
        self.assertIsNotNone(self.client_b.agent_id, "Agent B failed to register")
        self.assertEqual(self.client_a._status, "connected")
        self.assertEqual(self.client_b._status, "connected")

        # 2. Verify each agent receives peer list
        end = time.time() + 3.0
        while time.time() < end:
            if (
                self.client_b.agent_id in self.client_a.peers
                and self.client_a.agent_id in self.client_b.peers
            ):
                break
            time.sleep(0.1)

        self.assertIn(self.client_b.agent_id, self.client_a.peers)
        self.assertIn(self.client_a.agent_id, self.client_b.peers)
        self.assertEqual(self.client_a.peers[self.client_b.agent_id]["status"], "online")

        # 3. Agent A sends connection request to Agent B
        req_res = self.client_a.send_connect_request(self.client_b.agent_id)
        self.assertTrue(req_res["success"])
        self.assertEqual(self.client_a.peers[self.client_b.agent_id]["session_status"], "pending_sent")

        # 4. Wait for Agent B to receive incoming request
        end = time.time() + 3.0
        while time.time() < end:
            if any(r["from_agent_id"] == self.client_a.agent_id for r in self.client_b.incoming_requests):
                break
            time.sleep(0.1)

        incoming_ids = [r["from_agent_id"] for r in self.client_b.incoming_requests]
        self.assertIn(self.client_a.agent_id, incoming_ids)

        # 5. Agent B accepts the request
        accept_res = self.client_b.respond_connect_request(self.client_a.agent_id, accept=True)
        self.assertTrue(accept_res["success"])

        # Wait for both agents to receive session update
        end = time.time() + 3.0
        while time.time() < end:
            if (
                self.client_b.agent_id in self.client_a.active_sessions
                and self.client_a.agent_id in self.client_b.active_sessions
            ):
                break
            time.sleep(0.1)

        self.assertIn(self.client_b.agent_id, self.client_a.active_sessions)
        self.assertIn(self.client_a.agent_id, self.client_b.active_sessions)

        # 6. Agent A sends a chat message to Agent B
        send_res = self.client_a.send_chat(self.client_b.agent_id, "End-to-end test message")
        self.assertTrue(send_res["success"])

        # 7. Agent B receives the message
        end = time.time() + 3.0
        while time.time() < end:
            b_msgs = self.client_b.conversations.get(self.client_a.agent_id, [])
            if any(m["text"] == "End-to-end test message" for m in b_msgs):
                break
            time.sleep(0.1)

        b_msgs = self.client_b.conversations.get(self.client_a.agent_id, [])
        self.assertTrue(
            any(m["text"] == "End-to-end test message" for m in b_msgs),
            "Agent B did not receive chat message",
        )

        # Agent A receives delivery update
        end = time.time() + 3.0
        while time.time() < end:
            a_msgs = self.client_a.conversations.get(self.client_b.agent_id, [])
            if any(m.get("status") == "delivered" for m in a_msgs):
                break
            time.sleep(0.1)

        a_msgs = self.client_a.conversations.get(self.client_b.agent_id, [])
        self.assertTrue(
            any(m.get("status") == "delivered" for m in a_msgs),
            "Agent A did not receive delivery update",
        )

        # 8. Verify get_state() structure for HTTP polling
        state_a = self.client_a.get_state()
        self.assertEqual(state_a["status"], "connected")
        self.assertTrue(state_a["connected"])
        self.assertIn(self.client_b.agent_id, state_a["active_sessions"])
        self.assertIn(self.client_b.agent_id, state_a["conversations"])


if __name__ == "__main__":
    unittest.main()
