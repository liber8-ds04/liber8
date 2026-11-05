"""
services/state_manager.py
--------------------------
ClinicalStateManager — the central brain of the Liber8 session engine.

Responsibilities:
  - Hold the authoritative in-memory session state (single source of truth).
  - Apply telemetry updates and run the panic-detection state machine.
  - Execute clinician / patient commands and transition the exposure level.
  - Delegate audit logging to an injected EventLogger instance (Dependency
    Injection pattern keeps this class fully unit-testable in isolation).

State machine — exposure levels (ordered):
    Baseline → Level 1 → Level 2 → Level 3 → Level 4 → Level 5

Panic auto-step-down:
    If mode == "AUTO" and score >= PANIC_THRESHOLD for PANIC_DURATION_SECONDS
    consecutive seconds → trigger step-down and reset the panic timer.
"""

from __future__ import annotations

from typing import Any

from backend.config import PANIC_DURATION_SECONDS, PANIC_THRESHOLD
from backend.models import CommandPayload, TelemetryPayload
from backend.services.logger import EventLogger


# Ordered exposure levels from least to most intense.
EXPOSURE_LEVELS: list[str] = [
    "Baseline",
    "Level 1",
    "Level 2",
    "Level 3",
    "Level 4",
    "Level 5",
]


class ClinicalStateManager:
    """
    Manages the live clinical session state and all state transitions.

    State dictionary schema
    -----------------------
    hr                    : float  — latest heart-rate reading (BPM)
    eda                   : float  — latest EDA reading (µS)
    score                 : float  — latest normalized stress score [0, 1]
    level                 : str    — current VR exposure level label
    mode                  : str    — "AUTO" | "CLINICIAN"
    panic_sustained_seconds : int  — consecutive seconds above panic threshold
    session_complete      : bool   — True once "end_session" command is received
    """

    def __init__(self) -> None:
        """Initialise the session with safe, clinically neutral defaults."""
        self._state: dict[str, Any] = {
            "hr": 72.0,
            "eda": 2.5,
            "score": 0.20,
            "level": "Baseline",
            "mode": "AUTO",
            "panic_sustained_seconds": 0,
            "session_complete": False,
        }

    # ------------------------------------------------------------------
    # Public accessors
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        """
        Return a shallow copy of the current session state.

        Returns a copy so callers cannot mutate internal state directly,
        preserving encapsulation.
        """
        return dict(self._state)

    # ------------------------------------------------------------------
    # Telemetry processing
    # ------------------------------------------------------------------

    def update_telemetry(
        self,
        data: TelemetryPayload,
        logger: EventLogger,
    ) -> None:
        """
        Ingest a new biosignal reading and run the panic-detection logic.

        Parameters
        ----------
        data   : TelemetryPayload  — validated sensor payload from the VR device.
        logger : EventLogger       — injected logger; used only when auto-step-down fires.

        Panic state machine
        -------------------
        1. Update hr / eda / score from the payload.
        2. Only run panic logic when mode == "AUTO" and session is active.
        3. If score >= PANIC_THRESHOLD → increment panic_sustained_seconds.
           Else → reset panic_sustained_seconds to 0 (must be *sustained*).
        4. If panic_sustained_seconds >= PANIC_DURATION_SECONDS:
               a. Execute a step-down transition.
               b. Reset panic_sustained_seconds to 0.
               c. Log the automatic intervention.
        """
        if self._state["session_complete"]:
            return  # Ignore telemetry after session ends.

        # 1. Update raw telemetry.
        self._state["hr"] = data.hr
        self._state["eda"] = data.eda
        self._state["score"] = data.score

        # 2–4. Panic detection (AUTO mode only).
        if self._state["mode"] == "AUTO":
            if data.score >= PANIC_THRESHOLD:
                self._state["panic_sustained_seconds"] += 1
            else:
                self._state["panic_sustained_seconds"] = 0  # Reset on drop.

            if self._state["panic_sustained_seconds"] >= PANIC_DURATION_SECONDS:
                self._step_down()
                self._state["panic_sustained_seconds"] = 0
                self._state["level"] = "Step Down Triggered"
                logger.log_event(
                    action="auto_step_down",
                    source="auto",
                    current_level=self._state["level"],
                )

    # ------------------------------------------------------------------
    # Command execution
    # ------------------------------------------------------------------

    def execute_command(
        self,
        command: CommandPayload,
        logger: EventLogger,
    ) -> None:
        """
        Apply a clinician or patient command to the session state.

        Every command is logged regardless of whether it changes state,
        providing a complete audit trail.

        Supported actions
        -----------------
        step_up       : Move to the next more-intense exposure level (capped at max).
        step_down     : Move to the next less-intense exposure level (capped at min).
        pause         : Freeze the exposure level label at "Paused".
        resume        : Restore the exposure level to whatever it was before pause.
                        (Simplified: sets level to "Baseline" if previously "Paused".)
        toggle_mode   : Switch between "AUTO" and "CLINICIAN" modes.
        end_session   : Mark the session as complete and freeze all further telemetry.
        """
        if self._state["session_complete"] and command.action != "end_session":
            return  # Session over — no further commands processed.

        action = command.action

        if action == "step_up":
            self._step_up()

        elif action == "step_down":
            self._step_down()

        elif action == "pause":
            self._state["level"] = "Paused"

        elif action == "resume":
            # If still paused, resume to Baseline as a safe default.
            if self._state["level"] == "Paused":
                self._state["level"] = "Baseline"

        elif action == "toggle_mode":
            self._state["mode"] = (
                "CLINICIAN" if self._state["mode"] == "AUTO" else "AUTO"
            )
            # Reset the panic timer when switching to avoid stale counts.
            self._state["panic_sustained_seconds"] = 0

        elif action == "end_session":
            self._state["session_complete"] = True
            self._state["level"] = "Session Complete"

        # Audit every command unconditionally.
        logger.log_event(
            action=action,
            source=command.source,
            current_level=self._state["level"],
        )

    # ------------------------------------------------------------------
    # Private level-transition helpers
    # ------------------------------------------------------------------

    def _current_level_index(self) -> int:
        """
        Return the index of the current level in EXPOSURE_LEVELS.
        Returns 0 (Baseline) if the current label is not in the ordered list
        (e.g. "Paused", "Step Down Triggered", "Session Complete").
        """
        level = self._state["level"]
        if level in EXPOSURE_LEVELS:
            return EXPOSURE_LEVELS.index(level)
        return 0  # Safe fallback.

    def _step_up(self) -> None:
        """Advance one exposure level, capped at the maximum."""
        idx = self._current_level_index()
        new_idx = min(idx + 1, len(EXPOSURE_LEVELS) - 1)
        self._state["level"] = EXPOSURE_LEVELS[new_idx]

    def _step_down(self) -> None:
        """
        Retreat one exposure level, capped at the minimum (Baseline).
        Note: The caller (update_telemetry or execute_command) is responsible
        for overwriting `level` with "Step Down Triggered" when needed for
        auto-interventions, so this helper simply decrements the index.
        """
        idx = self._current_level_index()
        new_idx = max(idx - 1, 0)
        self._state["level"] = EXPOSURE_LEVELS[new_idx]

