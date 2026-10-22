# Architecture Index

This index is not the full contract. Do not implement from this file alone; follow the artifact paths below.

## Global artifacts

- `unit_graph.yaml`: unit boundaries, triggers, signatures, dependencies, and shared references.
- `wire_contracts.yaml`: filter by `unit` for REST, TCP, and SQLite contracts.
- `shared_modules.yaml`: filter by `used_by_units`; `api-client` is shared by all dashboard pages.
- `cross_unit_state.yaml`: filter by writer/reader unit for browser role and heartbeat flows.
- `project-structure.md`, `tech-stack.md`, `data-model.md`: global structural, stack, and data evidence.

## Implementation Guide

### frontend-overview

- Trigger: browser `/`.
- Read `units/frontend-overview/behavior.yaml`, `bindings.yaml`, and `unit_decomposition.yaml`.
- Filter `wire_contracts.yaml` to backend-api and `shared_modules.yaml` to api-client.
- Completion evidence: preserve polling, metrics/cards, recent alerts, role gate, and disconnected state; report build evidence.

### frontend-monitoring

- Trigger: browser `/monitoring`.
- Read the three `units/frontend-monitoring/*` files.
- Filter contracts for metrics/flows/interfaces/monitoring and shared `api-client`.
- Completion evidence: preserve live-capture controls, synthetic fallback messaging, charts, protocol distribution, and flow filtering.

### frontend-security

- Trigger: browser `/security`.
- Read the three `units/frontend-security/*` files.
- Filter contracts for events/model/simulation and shared `api-client`.
- Completion evidence: preserve simulations, custom lab, diagnostics, event details, clearing/export behavior, and polling.

### frontend-devices

- Trigger: browser `/devices`.
- Read the three `units/frontend-devices/*` files.
- Filter contracts for agent control and heartbeat state.
- Completion evidence: preserve connection state, heartbeat/RTT, probe ACK, command copy, and device polling.

### backend-api

- Trigger: FastAPI HTTP API on port 8000.
- Read the three `units/backend-api/*` files.
- Filter `wire_contracts.yaml` where `unit: backend-api`; inspect shared state involving backend-api.
- Completion evidence: preserve route paths/response fields, packet-to-analysis pipeline, event persistence, startup/shutdown services, and validation responses.

### agent-client

- Trigger: TCP connection to port 5000.
- Read the three `units/agent-client/*` files.
- Filter `wire_contracts.yaml` where `unit: agent-client`.
- Completion evidence: preserve newline JSON framing, HELLO handshake, 3-second heartbeat, reconnect behavior, probe ACK, and traffic scenarios.

