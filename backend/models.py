"""
models.py
---------
Pydantic Data Transfer Objects (DTOs) for the Liber8 Clinical Dashboard.

Validation layer ensuring biosignal integrity, clinical command validation,
and automated detection of sensor faults or patient distress feedback.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class TelemetryPayload(BaseModel):
    """
    Incoming real-time biosignal data from the VR headset / sensor suite.

    Attributes
    ----------
    hr : float
        Heart Rate in beats-per-minute (BPM). Sensor fault flagged if hr < 40.
    eda : float
        Electrodermal Activity in microsiemens (µS). Sensor fault flagged if eda == 0.0.
    score : float
        Normalized composite stress score in the range [0.0, 1.0].
    patient_feedback : str
        Subjective patient experience: "Stable", "Challenging", or "Overwhelmed".
    """

    hr: float = Field(..., description="Heart rate in BPM", ge=0.0, le=300.0)
    eda: float = Field(..., description="Electrodermal activity in µS", ge=0.0)
    score: float = Field(
        ..., description="Normalized stress score [0.0 – 1.0]", ge=0.0, le=1.0
    )
    patient_feedback: Optional[Literal["Stable", "Challenging", "Overwhelmed"]] = Field(
        default="Stable",
        description="Patient subjective feedback: Stable, Challenging, or Overwhelmed",
    )

    @property
    def has_sensor_fault(self) -> bool:
        """Returns True if telemetry indicates lead-off or disconnected electrodes."""
        return self.hr < 40.0 or self.eda <= 0.0


class CommandPayload(BaseModel):
    """
    A clinical or automated command that modifies the session state.

    Attributes
    ----------
    action : str
        The specific intervention to execute: step_up, step_down, pause,
        resume, toggle_mode, end_session.
    source : str
        Originator of the command: "auto", "doctor", or "patient".
    """

    action: Literal[
        "step_up",
        "step_down",
        "pause",
        "resume",
        "toggle_mode",
        "end_session",
    ] = Field(..., description="The intervention action to perform.")

    source: Literal["auto", "doctor", "patient"] = Field(
        ..., description="Originator of the command."
    )
