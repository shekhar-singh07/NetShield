# Data Model

## Persisted tables

`security_events` stores an auto-increment ID, timestamp, source/destination IP, protocol, event type, severity, reason, optional confidence, and serialized raw data.

`flow_summaries` defines timestamp, endpoint IPs/ports, protocol, packet count, byte count, and duration. The current persistence module creates this schema, while active flow results are primarily held in memory by `FlowAnalyzer`.

## Runtime entities

- **Packet**: timestamp, source/destination IP, source/destination port, protocol, length, TCP flags.
- **Flow**: 5-tuple key plus packet/byte counts, first/last seen, duration, SYN/ACK/RST counts, derived rates.
- **Detection features**: packet rate, burst rate, unique destination ports, connection rate, RST count, average packet size, SYN ratio.
- **Security event**: type, severity, reason, source, protocol, optional ML confidence/raw feature data.
- **Remote device**: hostname, IP, socket status, heartbeat sequence/timestamps, RTT.

## State relationships

Captured or synthetic packets feed both `FlowAnalyzer` and `DetectionEngine`. Detection callbacks append to an in-memory recent queue (maximum 200) and persist to SQLite. TCP heartbeat state feeds device and latency API responses.

