"""
services/state_manager.py
--------------------------
ClinicalStateManager — Core OOP state engine for the Liber8 VR Exposure Dashboard.

Clinical Safety Features:
  1. Baseline Calculation: Captures the average Stress Score during the first 30 seconds.
  2. Boredom / Phase 2 Recommendation: If patient stress score stays within 5% of resting
     baseline for 15 consecutive seconds, flags `step_up_recommended = True`.
  3. Full Panic / Phase 3 Failsafe: Automated Step Down if Stress Score >= 0.85 for 5 seconds.
  4. Sensor Fault & Manual Pause Fallback: Immediately transitions to "Safe Room: Beautiful Scenery"
     if hr < 40, eda == 0.0, or clinician clicks Pause.
"""

from __future__ import annotations

from typing import Any, Optional

from backend.config import PANIC_DURATION_SECONDS, PANIC_THRESHOLD
from backend.models import CommandPayload, TelemetryPayload
from backend.services.logger import EventLogger


# Ordered clinical exposure levels
EXPOSURE_LEVELS: list[str] = [
    "Baseline",
    "Level 1",
    "Level 2",
    "Level 3",
    "Level 4",
    "Level 5",
]

FALLBACK_SAFE_ROOM: str = "Safe Room: Beautiful Scenery"
BASELINE_TARGET_SAMPLES: int = 30
BOREDOM_WINDOW_SECONDS: int = 15
BOREDOM_DELTA_THRESHOLD: float = 0.05  # 5% threshold relative to resting baseline


class ClinicalStateManager:
    """
    Manages the authoritative in-memory clinical session state, biosensor safety
    thresholds, automated failsafes, and exposure transitions.
    """

    def __init__(self) -> None:
        """Initialise clinical session state with safe physiological defaults."""
        self._state: dict[str, Any] = {
            "hr": 72.0,
            "eda": 2.50,
            "score": 0.20,
            "patient_feedback": "Stable",
            "level": "Baseline",
            "mode": "AUTO",
            "sensor_error": False,
            "baseline_stress": 0.20,
            "baseline_ready": False,
            "baseline_sample_count": 0,
            "step_up_recommended": False,
            "panic_sustained_seconds": 0,
            "boredom_sustained_seconds": 0,
            "session_complete": False,
        }

        # Internal tracking state
        self._baseline_samples: list[float] = []
        self._is_paused: bool = False
        self._saved_level_before_override: Optional[str] = None

    # ------------------------------------------------------------------
    # State Accessor
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any]:
        """Return an immutable snapshot of current session state."""
        return dict(self._state)

    # ------------------------------------------------------------------
    # Telemetry Processing & Safety Engine
    # ------------------------------------------------------------------

    def update_telemetry(
        self,
        data: TelemetryPayload,
        logger: EventLogger,
    ) -> None:
        """
        Process incoming biosignal telemetry:
          - Sensor fault detection (hr < 40 or eda == 0.0) -> Fallback to Safe Room
          - 30-second baseline stress averaging
          - 15-second boredom / readiness detection -> step_up_recommended = True
          - 5-second panic failsafe -> Automated Step Down
        """
        if self._state["session_complete"]:
            return

        # 1. Update live biometrics & patient feedback
        self._state["hr"] = float(data.hr)
        self._state["eda"] = float(data.eda)
        self._state["score"] = float(data.score)
        self._state["patient_feedback"] = data.patient_feedback or "Stable"

        # 2. Sensor Fault Detection & Fallback
        is_sensor_fault = data.has_sensor_fault or (data.hr < 40.0) or (data.eda <= 0.0)
        previous_sensor_error = self._state["sensor_error"]
        self._state["sensor_error"] = is_sensor_fault

        if is_sensor_fault:
            if not previous_sensor_error:
                if self._state["level"] != FALLBACK_SAFE_ROOM:
                    self._saved_level_before_override = self._state["level"]
                self._state["level"] = FALLBACK_SAFE_ROOM
                logger.log_event(
                    action="sensor_fault_fallback",
                    source="auto",
                    current_level=FALLBACK_SAFE_ROOM,
                )
            # Freeze panic and boredom counters during sensor fault
            self._state["panic_sustained_seconds"] = 0
            self._state["boredom_sustained_seconds"] = 0
            self._state["step_up_recommended"] = False
            return

        # Handle sensor recovery if not manually paused
        if previous_sensor_error and not is_sensor_fault and not self._is_paused:
            restored_level = self._saved_level_before_override or "Baseline"
            self._state["level"] = restored_level
            self._saved_level_before_override = None
            logger.log_event(
                action="sensor_recovered",
                source="auto",
                current_level=restored_level,
            )

        # If manually paused, maintain Safe Room display
        if self._is_paused:
            self._state["level"] = FALLBACK_SAFE_ROOM
            return

        # 3. Baseline Calculation (First 30 seconds / samples)
        if not self._state["baseline_ready"]:
            self._baseline_samples.append(data.score)
            sample_count = len(self._baseline_samples)
            current_avg = sum(self._baseline_samples) / sample_count
            self._state["baseline_stress"] = round(current_avg, 3)
            self._state["baseline_sample_count"] = sample_count

            if sample_count >= BASELINE_TARGET_SAMPLES:
                self._state["baseline_ready"] = True
                logger.log_event(
                    action="baseline_established",
                    source="auto",
                    current_level=self._state["level"],
                )

        # 4. Boredom / Phase 2 Recommendation
        # If stress score remains within 5% (0.05) of baseline for 15 consecutive seconds
        if self._state["baseline_ready"]:
            baseline = self._state["baseline_stress"]
            deviation = abs(data.score - baseline)

            if deviation <= BOREDOM_DELTA_THRESHOLD:
                self._state["boredom_sustained_seconds"] += 1
            else:
                self._state["boredom_sustained_seconds"] = 0
                self._state["step_up_recommended"] = False

            if self._state["boredom_sustained_seconds"] >= BOREDOM_WINDOW_SECONDS:
                self._state["step_up_recommended"] = True
            else:
                self._state["step_up_recommended"] = False

        # 5. Full Panic / Phase 3 Failsafe (AUTO mode only)
        if self._state["mode"] == "AUTO":
            if data.score >= PANIC_THRESHOLD:
                self._state["panic_sustained_seconds"] += 1
            else:
                self._state["panic_sustained_seconds"] = 0

            if self._state["panic_sustained_seconds"] >= PANIC_DURATION_SECONDS:
                self._step_down()
                self._state["panic_sustained_seconds"] = 0
                self._state["level"] = "Step Down Triggered"
                self._state["boredom_sustained_seconds"] = 0
                self._state["step_up_recommended"] = False
                logger.log_event(
                    action="auto_step_down",
                    source="auto",
                    current_level=self._state["level"],
                )

    # ------------------------------------------------------------------
    # Command Execution
    # ------------------------------------------------------------------

    def execute_command(
        self,
        command: CommandPayload,
        logger: EventLogger,
    ) -> None:
        """
        Execute clinician interventions:
          - step_up / step_down
          - pause (Immediate Safe Room: Beautiful Scenery fallback)
          - resume (Restores previous active level)
          - toggle_mode (Switches between AUTO and CLINICIAN)
          - end_session (Concludes exposure trial)
        """
        if self._state["session_complete"] and command.action != "end_session":
            return

        action = command.action

        if action == "step_up":
            # If paused or in Safe Room, unpause and resume progression
            self._is_paused = False
            self._step_up()
            self._state["boredom_sustained_seconds"] = 0
            self._state["step_up_recommended"] = False

        elif action == "step_down":
            self._is_paused = False
            self._step_down()
            self._state["boredom_sustained_seconds"] = 0
            self._state["step_up_recommended"] = False

        elif action == "pause":
            # Safe Room: Beautiful Scenery override
            self._is_paused = True
            if self._state["level"] != FALLBACK_SAFE_ROOM:
                self._saved_level_before_override = self._state["level"]
            self._state["level"] = FALLBACK_SAFE_ROOM
            self._state["panic_sustained_seconds"] = 0
            self._state["boredom_sustained_seconds"] = 0
            self._state["step_up_recommended"] = False

        elif action == "resume":
            self._is_paused = False
            if not self._state["sensor_error"]:
                restored = self._saved_level_before_override or "Baseline"
                self._state["level"] = restored
                self._saved_level_before_override = None

        elif action == "toggle_mode":
            self._state["mode"] = (
                "CLINICIAN" if self._state["mode"] == "AUTO" else "AUTO"
            )
            self._state["panic_sustained_seconds"] = 0

        elif action == "end_session":
            self._state["session_complete"] = True
            self._state["level"] = "Session Complete"
            self._state["step_up_recommended"] = False

        # Audit log event
        logger.log_event(
            action=action,
            source=command.source,
            current_level=self._state["level"],
        )

    # ------------------------------------------------------------------
    # Exposure Level Transitions
    # ------------------------------------------------------------------

    def _current_level_index(self) -> int:
        """Return the index of the active level, defaulting safely to Baseline."""
        level = self._state["level"]
        if level in EXPOSURE_LEVELS:
            return EXPOSURE_LEVELS.index(level)
        if self._saved_level_before_override in EXPOSURE_LEVELS:
            return EXPOSURE_LEVELS.index(self._saved_level_before_override)
        return 0

    def _step_up(self) -> None:
        """Advance to next exposure level (capped at Level 5)."""
        idx = self._current_level_index()
        new_idx = min(idx + 1, len(EXPOSURE_LEVELS) - 1)
        self._state["level"] = EXPOSURE_LEVELS[new_idx]
        self._saved_level_before_override = None

    def _step_down(self) -> None:
        """Retreat to previous exposure level (capped at Baseline)."""
        idx = self._current_level_index()
        new_idx = max(idx - 1, 0)
        self._state["level"] = EXPOSURE_LEVELS[new_idx]
        self._saved_level_before_override = None
