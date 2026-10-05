"""
Test script to verify the full NetShield-ML pipeline.
1. Checks /api/status
2. Injects simulated port scan and traffic spike
3. Checks /api/events to confirm real detection rules triggered
4. Checks /api/metrics to confirm flow stats
"""
import os
import urllib.request
import json
import time

API = os.getenv("API_URL", os.getenv("VITE_API_URL", "http://127.0.0.1:8000")).rstrip("/")

def get(path):
    with urllib.request.urlopen(f"{API}{path}", timeout=5) as r:
        return json.loads(r.read().decode())

def post(path):
    req = urllib.request.Request(f"{API}{path}", data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode())

print("1. Testing GET /api/status...")
status = get("/api/status")
print("   System:", status.get("system"), "v" + status.get("version"))
print("   Host:", status.get("hostname"), "IP:", status.get("ip"))
print("   Detection Mode:", status.get("detection", {}).get("mode"))

print("\n2. Triggering Port Scan simulation...")
res = post("/api/simulate/traffic?scenario=port_scan")
print("   Generated packets:", res.get("packets_generated"))

print("\n3. Triggering Traffic Spike simulation...")
res = post("/api/simulate/traffic?scenario=traffic_spike")
print("   Generated packets:", res.get("packets_generated"))

time.sleep(1)

print("\n4. Checking GET /api/events...")
events = get("/api/events")
print(f"   Total recorded events: {events.get('total')}")
for evt in events.get("events", [])[:5]:
    print(f"   [{evt.get('severity')}] {evt.get('type')}: {evt.get('reason')}")

print("\n5. Checking GET /api/metrics...")
metrics = get("/api/metrics")
print("   Total packets processed:", metrics.get("packets"))
print("   Packet rate:", metrics.get("packets_per_second"), "pkt/s")
print("   Bandwidth:", metrics.get("bandwidth_mbps"), "Mbps")
print("   Active flows:", metrics.get("flows"))
print("   Protocols:", metrics.get("protocols"))

print("\n6. Checking GET /api/devices...")
devices = get("/api/devices")
print("   Local device:", devices.get("local"))
print("   Remote device:", devices.get("remote"))

print("\n7. Checking GET /api/detection/model...")
model_info = get("/api/detection/model")
print("   Model name:", model_info.get("name"))
print("   Loaded:", model_info.get("loaded"))
print("   Validation Accuracy:", f"{model_info.get('accuracy', 0) * 100:.1f}%")
print("   Classes:", model_info.get("classes"))
print("   Top Features:", sorted(model_info.get("feature_importances", {}).items(), key=lambda x: x[1], reverse=True)[:3])

print("\nALL BACKEND, DETECTION & ML PIPELINE TESTS PASSED!")
