"""
NetShield-ML — Multi-Agent Registry & Relay
Manages agent registration, peer discovery, session negotiation, and message relay.
Agents communicate in a hub-and-spoke topology through the NetShield server.
"""
import json
import logging
import re
import socket
import threading
import time
from datetime import datetime

try:
    from backend.config import AGENT_PAIRING_CODE
    from backend.database.messages import (
        store_message,
        update_message_status,
        get_queued_messages,
        mark_messages_delivered,
    )
except ImportError:
    from config import AGENT_PAIRING_CODE
    from database.messages import (
        store_message,
        update_message_status,
        get_queued_messages,
        mark_messages_delivered,
    )

logger = logging.getLogger("netshield.multi_agent")


class MultiAgentRegistry:
    """
    In-memory registry and relay for multiple connected agents.
    Thread-safe.
    """

    def __init__(self, pairing_code: str = None):
        self.pairing_code = pairing_code or AGENT_PAIRING_CODE
        self._lock = threading.Lock()

        # agent_id -> {
        #   "agent_id": str,
        #   "name": str,
        #   "ip": str,
        #   "port": int,
        #   "connected_at": str,
        #   "last_seen": float,
        #   "status": "online" | "offline",
        #   "client": socket.socket
        # }
        self.agents = {}

        # socket -> agent_id
        self.socket_to_agent = {}

        # Set of frozenset({agent_a, agent_b}) for established peer sessions
        self.accepted_pairs = set()

    def is_registered(self, client: socket.socket) -> bool:
        """Check whether a client socket has successfully registered."""
        with self._lock:
            agent_id = self.socket_to_agent.get(client)
            return bool(agent_id and agent_id in self.agents and self.agents[agent_id]["status"] == "online")

    def get_agent_id(self, client: socket.socket) -> str:
        """Get the agent_id for a client socket, if registered."""
        with self._lock:
            return self.socket_to_agent.get(client)

    def _safe_send(self, client: socket.socket, data: dict) -> bool:
        """Send a JSON envelope followed by newline."""
        try:
            line = json.dumps(data) + "\n"
            client.sendall(line.encode("utf-8"))
            return True
        except Exception as e:
            logger.debug(f"Failed to send to client: {e}")
            return False

    def can_message(self, from_id: str, to_id: str) -> bool:
        """Check if session handshake has been established between two agents."""
        with self._lock:
            return frozenset({from_id, to_id}) in self.accepted_pairs

    def get_peer_list(self) -> list:
        """
        Return public peer list: agent_id, name, and status only.
        Never exposes IPs or ports.
        """
        with self._lock:
            return [
                {
                    "agent_id": a["agent_id"],
                    "name": a["name"],
                    "status": a["status"],
                }
                for a in self.agents.values()
            ]

    def get_agents_status(self) -> list:
        """Return agent information for HTTP API (excludes raw socket)."""
        with self._lock:
            return [
                {
                    "agent_id": a["agent_id"],
                    "name": a["name"],
                    "status": a["status"],
                    "connected_at": a.get("connected_at"),
                    "last_seen": a.get("last_seen"),
                }
                for a in self.agents.values()
            ]

    def broadcast_peer_list(self):
        """Broadcast updated peer list to all currently online agents."""
        peers = self.get_peer_list()
        payload = {"type": "peer_list", "peers": peers}

        with self._lock:
            active_clients = [
                a["client"]
                for a in self.agents.values()
                if a["status"] == "online" and a["client"] is not None
            ]

        for client in active_clients:
            self._safe_send(client, payload)

    def handle_register(self, client: socket.socket, addr, msg: dict) -> dict:
        """
        Process 'register' message from an agent.
        Validates pairing code, allocates unique agent_id, flushes queued messages,
        and broadcasts updated peer list.
        """
        pairing_code = str(msg.get("pairing_code", "")).strip()
        raw_name = str(msg.get("agent_name", "")).strip() or "Agent"

        # Validate pairing code
        if pairing_code != str(self.pairing_code).strip():
            logger.warning(f"Registration rejected from {addr}: invalid pairing code '{pairing_code}'")
            resp = {
                "type": "register_ack",
                "success": False,
                "error": "Invalid pairing code",
                "code": "AUTH_FAILED",
            }
            self._safe_send(client, resp)
            return resp

        # Generate unique agent_id
        # Sanitize name to alphanumeric and hyphen
        clean_name = re.sub(r"[^a-zA-Z0-9_\-]", "", raw_name) or "Agent"

        with self._lock:
            # Check if this exact agent_name exists as an offline agent
            reconnect_id = None
            for aid, ainfo in self.agents.items():
                if ainfo["name"] == raw_name and ainfo["status"] == "offline":
                    reconnect_id = aid
                    break

            if reconnect_id:
                agent_id = reconnect_id
            else:
                # Disambiguate name if currently online or taken
                existing_ids = set(self.agents.keys())
                agent_id = clean_name
                counter = 1
                while agent_id in existing_ids:
                    agent_id = f"{clean_name}-{counter}"
                    counter += 1

            now_str = datetime.now().isoformat()
            self.agents[agent_id] = {
                "agent_id": agent_id,
                "name": raw_name,
                "ip": addr[0] if addr else "unknown",
                "port": addr[1] if addr else 0,
                "connected_at": now_str,
                "last_seen": time.time(),
                "status": "online",
                "client": client,
            }
            self.socket_to_agent[client] = agent_id

        logger.info(f"Agent registered: {agent_id} ({raw_name}) from {addr}")

        resp = {
            "type": "register_ack",
            "success": True,
            "agent_id": agent_id,
            "name": raw_name,
        }
        self._safe_send(client, resp)

        # Broadcast new peer list to all agents
        self.broadcast_peer_list()

        # Flush any queued messages waiting for this agent
        self._flush_queued_messages(agent_id, client, raw_name)

        return resp

    def _flush_queued_messages(self, agent_id: str, client: socket.socket, agent_name: str):
        """Deliver any stored offline messages to the newly connected agent."""
        try:
            queued = get_queued_messages(agent_id)
            if not queued:
                return

            delivered_ids = []
            for m in queued:
                # Look up sender's display name if available
                from_id = m["from_agent_id"]
                with self._lock:
                    from_info = self.agents.get(from_id)
                    from_name = from_info["name"] if from_info else from_id

                fwd = {
                    "type": "chat_message",
                    "id": m["id"],
                    "from_agent_id": from_id,
                    "from_name": from_name,
                    "content": m["content"],
                    "timestamp": m["timestamp"],
                    "queued": True,
                }
                if self._safe_send(client, fwd):
                    delivered_ids.append(m["id"])

            if delivered_ids:
                mark_messages_delivered(delivered_ids)
                logger.info(f"Delivered {len(delivered_ids)} queued message(s) to {agent_id}")
        except Exception as e:
            logger.error(f"Error delivering queued messages to {agent_id}: {e}")

    def handle_disconnect(self, client: socket.socket):
        """Called when a client socket disconnects."""
        agent_id = None
        with self._lock:
            agent_id = self.socket_to_agent.pop(client, None)
            if agent_id and agent_id in self.agents:
                self.agents[agent_id]["status"] = "offline"
                self.agents[agent_id]["client"] = None
                self.agents[agent_id]["last_seen"] = time.time()

        if agent_id:
            logger.info(f"Agent {agent_id} marked offline")
            self.broadcast_peer_list()

    def handle_peer_list_request(self, client: socket.socket):
        """Send current peer list to requesting client."""
        if not self.is_registered(client):
            self._send_unauthorized(client)
            return
        peers = self.get_peer_list()
        self._safe_send(client, {"type": "peer_list", "peers": peers})

    def handle_connect_request(self, client: socket.socket, msg: dict):
        """
        Process session handshake initiation from Agent A to Agent B.
        A -> Server -> B
        """
        if not self.is_registered(client):
            self._send_unauthorized(client)
            return

        from_id = self.get_agent_id(client)
        to_id = msg.get("to_agent_id")

        if not to_id:
            self._safe_send(client, {"type": "connect_error", "reason": "Missing to_agent_id"})
            return

        with self._lock:
            from_info = self.agents.get(from_id)
            target = self.agents.get(to_id)
            target_online = target and target["status"] == "online" and target["client"] is not None

        if not target or not target_online:
            self._safe_send(client, {
                "type": "connect_error",
                "to_agent_id": to_id,
                "reason": "offline",
            })
            return

        # Forward request to Agent B
        fwd = {
            "type": "incoming_request",
            "from_agent_id": from_id,
            "from_name": from_info["name"] if from_info else from_id,
        }
        self._safe_send(target["client"], fwd)

    def handle_connect_accept(self, client: socket.socket, msg: dict):
        """Agent B accepts connection request from Agent A."""
        if not self.is_registered(client):
            self._send_unauthorized(client)
            return

        peer_b_id = self.get_agent_id(client)
        peer_a_id = msg.get("from_agent_id")

        if not peer_a_id:
            return

        with self._lock:
            self.accepted_pairs.add(frozenset({peer_a_id, peer_b_id}))
            peer_a = self.agents.get(peer_a_id)
            peer_b = self.agents.get(peer_b_id)

        # Notify Agent A
        if peer_a and peer_a["status"] == "online" and peer_a["client"]:
            self._safe_send(peer_a["client"], {
                "type": "connect_accepted",
                "peer_id": peer_b_id,
                "peer_name": peer_b["name"] if peer_b else peer_b_id,
            })

        # Confirm to Agent B
        self._safe_send(client, {
            "type": "connect_accepted",
            "peer_id": peer_a_id,
            "peer_name": peer_a["name"] if peer_a else peer_a_id,
        })
        logger.info(f"Session established between {peer_a_id} and {peer_b_id}")

    def handle_connect_decline(self, client: socket.socket, msg: dict):
        """Agent B declines connection request from Agent A."""
        if not self.is_registered(client):
            self._send_unauthorized(client)
            return

        peer_b_id = self.get_agent_id(client)
        peer_a_id = msg.get("from_agent_id")
        reason = msg.get("reason", "Declined by user")

        if not peer_a_id:
            return

        with self._lock:
            peer_a = self.agents.get(peer_a_id)

        if peer_a and peer_a["status"] == "online" and peer_a["client"]:
            self._safe_send(peer_a["client"], {
                "type": "connect_declined",
                "peer_id": peer_b_id,
                "reason": reason,
            })
        logger.info(f"Session declined between {peer_a_id} and {peer_b_id}: {reason}")

    def handle_chat_message(self, client: socket.socket, msg: dict):
        """
        Relay a chat message from Agent A to Agent B.
        Requires established session handshake.
        Persists to SQLite messages table.
        """
        if not self.is_registered(client):
            self._send_unauthorized(client)
            return

        from_id = self.get_agent_id(client)
        to_id = msg.get("to_agent_id")
        content = msg.get("content", "")

        if not to_id:
            self._safe_send(client, {"type": "error", "code": "INVALID_RECIPIENT", "message": "Missing to_agent_id"})
            return

        if not self.can_message(from_id, to_id):
            self._safe_send(client, {
                "type": "error",
                "code": "NOT_CONNECTED",
                "message": f"Session not established with {to_id}",
            })
            return

        ts = datetime.now().isoformat()
        with self._lock:
            from_info = self.agents.get(from_id)
            from_name = from_info["name"] if from_info else from_id
            target = self.agents.get(to_id)
            target_online = target and target["status"] == "online" and target["client"] is not None

        if target_online:
            # Recipient is online: store as delivered and forward immediately
            msg_id = store_message(from_id, to_id, content, timestamp=ts, status="delivered")
            fwd = {
                "type": "chat_message",
                "id": msg_id,
                "from_agent_id": from_id,
                "from_name": from_name,
                "content": content,
                "timestamp": ts,
            }
            self._safe_send(target["client"], fwd)
            # Send delivery confirmation to sender
            self._safe_send(client, {"type": "chat_message_ack", "id": msg_id, "status": "delivered"})
        else:
            # Recipient is offline: store as queued
            msg_id = store_message(from_id, to_id, content, timestamp=ts, status="queued")
            self._safe_send(client, {"type": "chat_message_ack", "id": msg_id, "status": "queued"})
            logger.info(f"Message from {from_id} to {to_id} queued for offline delivery (id={msg_id})")

    def _send_unauthorized(self, client: socket.socket):
        """Send standard rejection to unregistered connections."""
        self._safe_send(client, {
            "type": "error",
            "code": "UNAUTHORIZED",
            "message": "Action requires successful registration",
        })
