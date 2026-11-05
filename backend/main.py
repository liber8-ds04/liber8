"""
main.py
-------
FastAPI application entry point for the Liber8 Clinical Exposure Dashboard.

Responsibilities:
  - Bootstrap the FastAPI application and configure CORS.
  - Instantiate the singleton ClinicalStateManager and EventLogger.
  - Register all HTTP routes (REST API + static file serving).
  - Serve the frontend SPA from the /frontend directory.

Run command (from project root E:\Projects\Liber8):
    uvicorn backend.main:app --reload --port 8000
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.models import CommandPayload, TelemetryPayload
from backend.services.logger import EventLogger
from backend.services.state_manager import ClinicalStateManager

# ---------------------------------------------------------------------------
# Application bootstrap
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Liber8 — VR Exposure Therapy Clinician Dashboard",
    description=(
        "Real-time biosignal monitoring, automated panic intervention, "
        "and clinician command API for in-session VR exposure therapy."
    ),
    version="1.0.0",
)

# Allow the frontend dev server (if served separately on a different port)
# to communicate with this API without being blocked by CORS policy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Restrict to specific origins in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Singleton service instances (application-level scope)
# ---------------------------------------------------------------------------

# Both objects are instantiated once at startup and reused across all requests.
# They are NOT recreated per-request, which is intentional: state_manager
# is the in-memory session store and must remain alive for the full session.
state_manager: ClinicalStateManager = ClinicalStateManager()
logger: EventLogger = EventLogger()

# ---------------------------------------------------------------------------
# Static file serving — mount the frontend SPA
# ---------------------------------------------------------------------------

# Resolve the absolute path to the frontend directory regardless of CWD.
FRONTEND_DIR: Path = Path(__file__).parent.parent / "frontend"

# Mount /static to serve CSS, JS, and image assets referenced by index.html.
app.mount(
    "/static",
    StaticFiles(directory=str(FRONTEND_DIR)),
    name="static",
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=FileResponse, tags=["Frontend"])
async def serve_dashboard() -> FileResponse:
    """
    Serve the main Clinician Dashboard SPA.

    Returns the index.html file from the frontend directory.
    This allows the entire application to be accessed at http://localhost:8000/.
    """
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html not found.")
    return FileResponse(str(index_path))


@app.get("/state", response_class=JSONResponse, tags=["Telemetry"])
async def get_state() -> dict:
    """
    Return the current session state snapshot.

    Called by the frontend every POLLING_INTERVAL seconds to refresh
    the dashboard display. Returns a plain JSON object with all live metrics.

    Returns
    -------
    dict
        Full session state including hr, eda, score, level, mode,
        panic_sustained_seconds, and session_complete.
    """
    return state_manager.get_state()


@app.post("/update_telemetry", status_code=200, tags=["Telemetry"])
async def update_telemetry(payload: TelemetryPayload) -> dict:
    """
    Ingest a new biosignal reading from the VR edge device.

    The payload is validated by Pydantic before reaching the state manager.
    The state manager runs the panic-detection state machine and may
    automatically trigger a step-down if the threshold is sustained.

    Parameters
    ----------
    payload : TelemetryPayload
        Validated JSON body with hr, eda, and score fields.

    Returns
    -------
    dict
        Acknowledgement with the updated session state.
    """
    state_manager.update_telemetry(data=payload, logger=logger)
    return {"status": "ok", "state": state_manager.get_state()}


@app.post("/command", status_code=200, tags=["Commands"])
async def execute_command(payload: CommandPayload) -> dict:
    """
    Execute a clinical or automated command against the session state.

    Valid actions: step_up, step_down, pause, resume, toggle_mode, end_session.
    Every command is written to the CSV audit log regardless of outcome.

    Parameters
    ----------
    payload : CommandPayload
        Validated JSON body with action and source fields.

    Returns
    -------
    dict
        Acknowledgement with the updated session state post-command.
    """
    state_manager.execute_command(command=payload, logger=logger)
    return {"status": "ok", "state": state_manager.get_state()}

