"""
config.py
---------
Global system constants for the Liber8 Clinical Exposure Dashboard.
All thresholds, paths, and timing values are centralized here to ensure
a single source of truth across the entire backend.
"""

# --- Panic Detection Thresholds ---
# The normalized stress score (0.0 - 1.0) above which a panic state is flagged.
PANIC_THRESHOLD: float = 0.85

# How many consecutive seconds the stress score must remain above PANIC_THRESHOLD
# before the system automatically triggers a "Step Down" intervention.
PANIC_DURATION_SECONDS: int = 5

# --- Persistence ---
# File path for the CSV audit log. Relative to the directory from which
# `uvicorn` is launched (the project root: E:\Projects\Liber8).
CSV_LOG_PATH: str = "events.csv"

# --- Polling ---
# The recommended interval (in seconds) at which the frontend should poll
# the GET /state endpoint. Stored here so it can be surfaced via the API
# if the frontend needs to auto-configure itself.
POLLING_INTERVAL: int = 1

