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
    from backend.config import AGENT_PAIRING_CODE, get_local_ip
    from backend.database.messages import (
        store_message,
        update_message_status,
        get_queued_messages,
        mark_messages_delivered,
    )
except ImportError:
    from config import AGENT_PAIRING_CODE, get_local_ip
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

    def __init__(self, pairing_code: str = None, on_security_event=None):
        self.pairing_code = pairing_code or AGENT_PAIRING_CODE
        self.on_security_event = on_security_event
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

        # Abuse controls & quarantine state
        self.quarantined_agents = set()
        self.quarantine_metadata = {}    # agent_id -> {"type": "auto"|"manual", "reason": str, "expires_at": float|None, "quarantined_at": float, "duration_seconds": float|None}
        self.auto_quarantine_enabled = True
        self.auto_quarantine_cooldown_seconds = 60.0  # 60s cooldown for live demo self-healing
        self.whitelist_ips = {
            "127.0.0.1", "::1", "localhost", "0.0.0.0",
            "8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1",
        }
        try:
            local_ip = get_local_ip()
            if local_ip:
                self.whitelist_ips.add(local_ip)
        except Exception:
            pass
        self.whitelist_agent_ids = set()
        self.ip_strikes = {}             # source_ip -> [strike_dict]
        self.sender_msg_times = {}       # agent_id -> [float timestamp]
        self.muted_until = {}            # agent_id -> float timestamp
        self.flood_violations = {}       # agent_id -> int count of violations

        # Background sweeper for auto-quarantine expiration
        self._sweeper_running = True
        self._sweeper_thread = threading.Thread(target=self._quarantine_sweeper, daemon=True)
        self._sweeper_thread.start()

    def _quarantine_sweeper(self):
        """Periodically check for expired auto-quarantines and self-heal."""
        while self._sweeper_running:
            time.sleep(1.0)
            try:
                self.check_quarantine_expirations()
            except Exception as e:
                logger.error(f"Error in quarantine sweeper: {e}")

    def check_quarantine_expirations(self) -> list:
        """Scan active quarantines and release those whose cooldown expired."""
        now = time.time()
        expired = []
        with self._lock:
            for aid in list(self.quarantined_agents):
                meta = self.quarantine_metadata.get(aid, {})
                expires_at = meta.get("expires_at")
                if expires_at and now >= expires_at:
                    expired.append(aid)

        released = []
        for aid in expired:
            if self.release_agent(aid, reason="Auto-quarantine cooldown expired (self-healing)"):
                released.append(aid)
        return released

    def is_ip_whitelisted(self, ip: str) -> bool:
        """Check if an IP address is protected by the whitelist."""
        tip = str(ip or "").strip()
        if not tip or tip in self.whitelist_ips:
            return True
        try:
            local_ip = get_local_ip()
            if local_ip and tip == local_ip:
                return True
        except Exception:
            pass
        return False

    def find_agents_by_ip(self, ip: str) -> list:
        """Find registered agents connected from a specific IP."""
        target_ip = str(ip or "").strip()
        if not target_ip:
            return []
        with self._lock:
            return [
                a for a in self.agents.values()
                if a.get("ip") == target_ip
            ]

    def _emit_security_event(self, event_type: str, severity: str, source_ip: str, reason: str, raw_data: dict = None):
        """Emit security event to server detection/alerts log."""
        if self.on_security_event:
            evt = {
                "timestamp": datetime.now().isoformat(),
                "source_ip": source_ip or "0.0.0.0",
                "destination_ip": "127.0.0.1",
                "protocol": "TCP",
                "type": event_type,
                "severity": severity.upper(),
                "reason": reason,
                "confidence": 1.0,
                "raw_data": raw_data or {},
            }
            try:
                self.on_security_event(evt)
            except Exception as e:
                logger.error(f"Error emitting security event: {e}")

    def auto_quarantine_agent(self, agent_id: str, reason: str, duration_seconds: float = None) -> bool:
        """
        Automatically place an agent in quarantine with a Time-To-Live (TTL).
        Enforces whitelist protection and notifies the agent client.
        """
        if not self.auto_quarantine_enabled:
            return False

        dur = duration_seconds if duration_seconds is not None else self.auto_quarantine_cooldown_seconds
        expires_at = time.time() + dur

        with self._lock:
            if agent_id not in self.agents:
                return False
            if agent_id in self.whitelist_agent_ids:
                logger.info(f"Auto-quarantine skipped: Agent '{agent_id}' is whitelisted.")
                return False

            ip = self.agents[agent_id].get("ip", "unknown")
            if self.is_ip_whitelisted(ip):
                logger.info(f"Auto-quarantine skipped for '{agent_id}': IP '{ip}' is whitelisted.")
                return False

            self.quarantined_agents.add(agent_id)
            self.quarantine_metadata[agent_id] = {
                "type": "auto",
                "reason": reason,
                "expires_at": expires_at,
                "quarantined_at": time.time(),
                "duration_seconds": dur,
            }
            client = self.agents[agent_id].get("client")

        self._emit_security_event(
            event_type="AUTO_QUARANTINE_TRIGGERED",
            severity="HIGH",
            source_ip=ip,
            reason=f"Agent '{agent_id}' auto-quarantined: {reason} (cooldown: {int(dur)}s).",
            raw_data={"agent_id": agent_id, "duration": dur, "rule": reason},
        )
        if client:
            self._safe_send(client, {
                "type": "system_notice",
                "message": f"Suspicious activity detected: {reason}. Agent automatically quarantined for {int(dur)}s.",
                "code": "AUTO_QUARANTINED",
                "remaining_seconds": int(dur),
            })
        logger.warning(f"Agent '{agent_id}' AUTO-QUARANTINED for {int(dur)}s: {reason}")
        return True

    def quarantine_agent(self, agent_id: str, reason: str = "Quarantined by server administrator") -> bool:
        """Place an agent in manual quarantine (permanent until manual release)."""
        with self._lock:
            if agent_id not in self.agents:
                return False
            self.quarantined_agents.add(agent_id)
            self.quarantine_metadata[agent_id] = {
                "type": "manual",
                "reason": reason,
                "expires_at": None,
                "quarantined_at": time.time(),
                "duration_seconds": None,
            }
            client = self.agents[agent_id].get("client")
            ip = self.agents[agent_id].get("ip", "unknown")

        self._emit_security_event(
            event_type="AGENT_QUARANTINED",
            severity="HIGH",
            source_ip=ip,
            reason=f"Agent '{agent_id}' was quarantined by server: {reason}.",
            raw_data={"agent_id": agent_id, "type": "manual"},
        )
        if client:
            self._safe_send(client, {
                "type": "system_notice",
                "message": f"Your agent has been placed in quarantine by the server ({reason}).",
                "code": "QUARANTINED",
            })
        return True

    def release_agent(self, agent_id: str, reason: str = None) -> bool:
        """Release an agent from quarantine (manual or automated)."""
        with self._lock:
            if agent_id not in self.agents:
                return False
            was_quarantined = agent_id in self.quarantined_agents
            self.quarantined_agents.discard(agent_id)
            meta = self.quarantine_metadata.pop(agent_id, {})
            client = self.agents[agent_id].get("client")
            ip = self.agents[agent_id].get("ip", "unknown")

        if not was_quarantined:
            return True

        is_auto = meta.get("type") == "auto" or (reason and "cooldown" in reason.lower())
        event_type = "AUTO_RELEASED" if is_auto else "AGENT_RELEASED"
        default_reason = "Auto-quarantine cooldown expired (self-healing)" if is_auto else "Released by server administrator"
        actual_reason = reason or default_reason

        self._emit_security_event(
            event_type=event_type,
            severity="LOW",
            source_ip=ip,
            reason=f"Agent '{agent_id}' was released from quarantine: {actual_reason}.",
            raw_data={"agent_id": agent_id, "release_reason": actual_reason},
        )
        if client:
            self._safe_send(client, {
                "type": "system_notice",
                "message": f"Your agent has been released from quarantine ({actual_reason}).",
                "code": "RELEASED",
            })
        logger.info(f"Agent '{agent_id}' released from quarantine ({actual_reason})")
        return True

    def is_quarantined(self, agent_id: str) -> bool:
        """Check if an agent is currently quarantined."""
        with self._lock:
            return agent_id in self.quarantined_agents

    def evaluate_security_event(self, event: dict) -> list:
        """
        Evaluate security event produced by the detection engine.
        Implements strict multi-factor defense against false alarms:
          1. Whitelist protection (DNS, localhost, gateway, admin agents).
          2. Severity filter (only HIGH and CRITICAL events evaluated).
          3. ML confidence thresholding (ignore low-confidence <0.70 alerts).
          4. Consensus & persistence check (requires either Hybrid Rule+ML consensus,
             extreme ML confidence >=0.88, or repeated strikes >=2 within 20s).
        Returns list of quarantined agent IDs.
        """
        if not self.auto_quarantine_enabled:
            return []

        source_ip = str(event.get("source_ip", "")).strip()
        if not source_ip or self.is_ip_whitelisted(source_ip):
            return []

        severity = str(event.get("severity", "LOW")).upper()
        if severity not in ("HIGH", "CRITICAL"):
            return []

        event_type = str(event.get("type", ""))
        confidence = float(event.get("confidence", 1.0) or 1.0)
        is_ml = event_type.startswith("ML_")

        # False alarm guard 1: ignore low-confidence ML alerts
        if is_ml and confidence < 0.70:
            return []

        # Find registered agents from this source IP
        matching_agents = self.find_agents_by_ip(source_ip)
        if not matching_agents:
            return []

        now = time.time()
        with self._lock:
            recent = [
                s for s in self.ip_strikes.get(source_ip, [])
                if now - s["timestamp"] < 20.0
            ]
            recent.append({
                "timestamp": now,
                "event_type": event_type,
                "severity": severity,
                "confidence": confidence,
                "is_ml": is_ml,
            })
            self.ip_strikes[source_ip] = recent

        # False alarm guard 2: multi-condition consensus check
        has_rule = any(not s["is_ml"] for s in recent)
        has_ml = any(s["is_ml"] for s in recent)
        hybrid_consensus = has_rule and has_ml
        extreme_ml = any(s["is_ml"] and s["confidence"] >= 0.88 for s in recent)
        persistent_ml = len([s for s in recent if s["is_ml"] and s["confidence"] >= 0.75]) >= 2
        persistent_rules = len([s for s in recent if not s["is_ml"]]) >= 2

        should_quarantine = (hybrid_consensus or extreme_ml or persistent_ml or persistent_rules)
        if not should_quarantine:
            return []

        # Formulate human-readable reason
        reason_parts = []
        if hybrid_consensus:
            reason_parts.append(f"Hybrid consensus (Heuristic rule + ML RandomForest confirmed {event_type})")
        elif extreme_ml:
            reason_parts.append(f"Extreme confidence ML detection ({int(confidence * 100)}% certainty)")
        elif persistent_ml:
            reason_parts.append(f"Persistent ML anomalies ({len(recent)} strikes in 20s)")
        else:
            reason_parts.append(f"Persistent attack traffic ({len(recent)} strikes in 20s)")

        full_reason = f"{event_type}: {', '.join(reason_parts)}"

        quarantined_ids = []
        for agent in matching_agents:
            aid = agent["agent_id"]
            if not self.is_quarantined(aid):
                if self.auto_quarantine_agent(aid, reason=full_reason):
                    quarantined_ids.append(aid)

        return quarantined_ids

    def get_quarantine_policy(self) -> dict:
        """Return the current auto-quarantine policy, whitelist, and active state."""
        with self._lock:
            now = time.time()
            active_quarantines = [
                {
                    "agent_id": aid,
                    "type": self.quarantine_metadata.get(aid, {}).get("type", "manual"),
                    "reason": self.quarantine_metadata.get(aid, {}).get("reason", "Unknown"),
                    "duration_seconds": self.quarantine_metadata.get(aid, {}).get("duration_seconds"),
                    "remaining_seconds": (
                        max(0, int(self.quarantine_metadata[aid]["expires_at"] - now))
                        if self.quarantine_metadata.get(aid, {}).get("expires_at")
                        else None
                    ),
                }
                for aid in self.quarantined_agents
            ]
            return {
                "enabled": self.auto_quarantine_enabled,
                "cooldown_seconds": self.auto_quarantine_cooldown_seconds,
                "whitelist_ips": sorted(list(self.whitelist_ips)),
                "whitelist_agents": sorted(list(self.whitelist_agent_ids)),
                "active_quarantines": active_quarantines,
            }

    def update_quarantine_policy(
        self,
        enabled: bool = None,
        cooldown_seconds: float = None,
        whitelist_ips: list = None,
        whitelist_agents: list = None,
    ) -> dict:
        """Update auto-quarantine configuration parameters."""
        with self._lock:
            if enabled is not None:
                self.auto_quarantine_enabled = bool(enabled)
            if cooldown_seconds is not None:
                self.auto_quarantine_cooldown_seconds = max(5.0, float(cooldown_seconds))
            if whitelist_ips is not None:
                self.whitelist_ips = set(whitelist_ips)
            if whitelist_agents is not None:
                self.whitelist_agent_ids = set(whitelist_agents)
        return self.get_quarantine_policy()

    FLOOD_WINDOW_SECONDS = 5.0   # Rolling window for message-rate tracking
    FLOOD_THRESHOLD = 10         # Max messages allowed within the window
    FLOOD_MUTE_AFTER = 3         # Violations before a 30s mute
    FLOOD_MUTE_SECONDS = 30.0

    def _check_message_rate(self, agent_id: str, agent_name: str) -> str:
        """
        Enforce per-sender message rate policy with tiered escalation:
          - > 10 messages in 5s: Warning
          - 3 violations: 30s Mute
          - 4 violations (or continued flooding): Tier 3 Automated Quarantine
        """
        now = time.time()
        status = "ok"
        with self._lock:
            muted_until = self.muted_until.get(agent_id)
            if muted_until is not None:
                if now < muted_until:
                    return "muted"
                # Mute expired — fresh start for this sender
                self.muted_until.pop(agent_id, None)
                self.flood_violations[agent_id] = 0
                self.sender_msg_times[agent_id] = []

            recent = [t for t in self.sender_msg_times.get(agent_id, []) if now - t < self.FLOOD_WINDOW_SECONDS]
            recent.append(now)
            self.sender_msg_times[agent_id] = recent

            if len(recent) > self.FLOOD_THRESHOLD:
                violations = self.flood_violations.get(agent_id, 0) + 1
                self.flood_violations[agent_id] = violations
                if violations >= 4:
                    status = "auto_quarantine"
                elif violations >= self.FLOOD_MUTE_AFTER:
                    self.muted_until[agent_id] = now + self.FLOOD_MUTE_SECONDS
                    self.sender_msg_times[agent_id] = []
                    status = "muted"
                else:
                    status = "warned"

        if status == "auto_quarantine":
            self.auto_quarantine_agent(
                agent_id,
                reason=f"Severe message flooding ({self.flood_violations.get(agent_id, 4)} violations)",
            )
            return "muted"
        elif status == "muted":
            self._emit_security_event(
                event_type="MESSAGE_FLOOD_MUTED",
                severity="HIGH",
                source_ip=self._agent_ip(agent_id),
                reason=f"Agent '{agent_name or agent_id}' muted for {int(self.FLOOD_MUTE_SECONDS)}s after {self.FLOOD_MUTE_AFTER} message-flood violations.",
                raw_data={"agent_id": agent_id, "violations": self.flood_violations.get(agent_id)},
            )
            self._safe_notice(client=self._agent_client(agent_id),
                              message=f"Message flood: you have been muted for {int(self.FLOOD_MUTE_SECONDS)} seconds.",
                              code="MUTED")
        elif status == "warned":
            self._emit_security_event(
                event_type="MESSAGE_FLOOD",
                severity="MEDIUM",
                source_ip=self._agent_ip(agent_id),
                reason=f"Agent '{agent_name or agent_id}' exceeded the message rate limit (> {self.FLOOD_THRESHOLD} messages in {int(self.FLOOD_WINDOW_SECONDS)}s).",
                raw_data={"agent_id": agent_id, "violations": self.flood_violations.get(agent_id)},
            )
            self._safe_notice(client=self._agent_client(agent_id),
                              message="Message flood warning: slow down or you will be temporarily muted.",
                              code="FLOOD_WARNING")
        return status

    def _agent_ip(self, agent_id: str) -> str:
        with self._lock:
            info = self.agents.get(agent_id)
            return info.get("ip", "unknown") if info else "unknown"

    def _agent_name(self, agent_id: str) -> str:
        with self._lock:
            info = self.agents.get(agent_id)
            return info.get("name") if info else None

    def _agent_client(self, agent_id: str):
        with self._lock:
            info = self.agents.get(agent_id)
            return info.get("client") if info else None

    def _safe_notice(self, client, message: str, code: str):
        """Send a system_notice to a client if it is connected."""
        if client:
            self._safe_send(client, {
                "type": "system_notice",
                "message": message,
                "code": code,
            })

    def record_heartbeat(self, client: socket.socket, rtt_ms: float = None):
        """Update last_seen and RTT for registered client."""
        with self._lock:
            agent_id = self.socket_to_agent.get(client)
            if agent_id and agent_id in self.agents:
                self.agents[agent_id]["last_seen"] = time.time()
                if rtt_ms is not None:
                    self.agents[agent_id]["rtt_ms"] = rtt_ms

    def get_active_sessions_list(self) -> list:
        """Return list of active agent-to-agent sessions."""
        sessions = []
        with self._lock:
            for pair in self.accepted_pairs:
                agents = list(pair)
                if len(agents) == 2:
                    a_id, b_id = agents[0], agents[1]
                    a_info = self.agents.get(a_id, {})
                    b_info = self.agents.get(b_id, {})
                    a_online = a_info.get("status") == "online"
                    b_online = b_info.get("status") == "online"
                    sessions.append({
                        "agent_a": a_id,
                        "agent_b": b_id,
                        "agent_a_name": a_info.get("name", a_id),
                        "agent_b_name": b_info.get("name", b_id),
                        "status": "active" if (a_online and b_online) else "degraded",
                    })
        return sessions

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
            now = time.time()
            res = []
            for a in self.agents.values():
                aid = a["agent_id"]
                is_q = aid in self.quarantined_agents
                meta = self.quarantine_metadata.get(aid, {})
                expires_at = meta.get("expires_at")
                remaining_sec = max(0, int(expires_at - now)) if (is_q and expires_at) else None
                res.append({
                    "agent_id": aid,
                    "name": a["name"],
                    "status": a["status"],
                    "ip": a.get("ip"),
                    "port": a.get("port"),
                    "connected_at": a.get("connected_at"),
                    "last_seen": (
                        datetime.fromtimestamp(a["last_seen"]).isoformat()
                        if isinstance(a.get("last_seen"), (int, float)) else a.get("last_seen")
                    ),
                    "quarantined": is_q,
                    "quarantine_type": meta.get("type") if is_q else None,
                    "quarantine_reason": meta.get("reason") if is_q else None,
                    "quarantine_remaining_seconds": remaining_sec,
                    "rtt_ms": a.get("rtt_ms"),
                })
            return res

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

        # Quarantined agents cannot initiate connection requests
        if self.is_quarantined(from_id):
            self._emit_security_event(
                event_type="QUARANTINE_BLOCKED_REQUEST",
                severity="HIGH",
                source_ip=self._agent_ip(from_id),
                reason=f"Quarantined agent '{from_id}' attempted to send a connection request to '{to_id}'.",
                raw_data={"agent_id": from_id, "target": to_id},
            )
            self._safe_send(client, {
                "type": "connect_error",
                "to_agent_id": to_id,
                "reason": "You are quarantined by the server.",
            })
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

        # Quarantined agents cannot establish new sessions
        if self.is_quarantined(peer_b_id):
            self._emit_security_event(
                event_type="QUARANTINE_BLOCKED_REQUEST",
                severity="HIGH",
                source_ip=self._agent_ip(peer_b_id),
                reason=f"Quarantined agent '{peer_b_id}' attempted to accept a connection request from '{peer_a_id}'.",
                raw_data={"agent_id": peer_b_id, "target": peer_a_id},
            )
            self._safe_send(client, {
                "type": "connect_error",
                "to_agent_id": peer_a_id,
                "reason": "You are quarantined by the server.",
            })
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

        # Quarantined senders are blocked before any persistence or relay
        if self.is_quarantined(from_id):
            self._emit_security_event(
                event_type="QUARANTINE_BLOCKED_MESSAGE",
                severity="HIGH",
                source_ip=self._agent_ip(from_id),
                reason=f"Quarantined agent '{from_id}' attempted to send a message to '{to_id}'.",
                raw_data={"agent_id": from_id, "target": to_id, "content": str(content)[:120]},
            )
            self._safe_send(client, {
                "type": "error",
                "code": "QUARANTINED",
                "message": "Your agent is quarantined by the server. Messages are blocked.",
            })
            return

        # Per-sender flood control and mute enforcement
        rate_status = self._check_message_rate(from_id, self._agent_name(from_id))
        if rate_status == "muted":
            self._safe_send(client, {
                "type": "error",
                "code": "MUTED_FLOOD",
                "message": f"You are muted for message flooding. Try again in {int(self.FLOOD_MUTE_SECONDS)}s.",
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
