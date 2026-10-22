# Technology Stack

- Frontend: React `^19.2.8`, React DOM `^19.2.8`, React Router DOM `^7.18.4`, Recharts `^3.10.1`, Vite `^8.3.0`, Tailwind CSS `^4.3.3`, Lucide React `^1.50.0`, Oxlint `^1.81.0`.
- Backend: Python, FastAPI `>=0.115.0`, Uvicorn `>=0.34.0`, Pydantic via FastAPI.
- Detection/data science: scikit-learn `>=1.5.0`, NumPy `>=1.26.0`, Joblib `>=1.4.0`.
- Persistence: SQLite through Python's standard `sqlite3` module.
- Packet capture: external Wireshark/TShark CLI; synthetic injection works without it.
- Transport: raw IPv4 TCP sockets for the agent channel; HTTP/JSON REST between browser and API; UDP/TCP sockets in the traffic generator.
- Configuration: `.env` values loaded by lightweight in-repository loaders; defaults in `backend/config.py`.
- No explicit Python or Node engine version is pinned in the manifests inspected.

