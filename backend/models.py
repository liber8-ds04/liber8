"""
models.py
---------
Pydantic Data Transfer Objects (DTOs) for the Liber8 Clinical Dashboard.

These models serve as the strict validation layer at every API boundary,
ensuring that malformed or out-of-range data never reaches core business logic.
"""

from typing import Literal
from pydantic import BaseModel, Field


class TelemetryPayload(BaseModel):
    """
    Incoming real-time biosignal data from the VR headset / sensor suite.

    Attributes
    ----------
    hr : float
        Heart Rate in beats-per-minute (BPM). Typical resting range: 50–100.
    eda : float
        Electrodermal Activity (skin conductance) in microsiemens (µS).
        Typical resting range: 1–20 µS.
    score : float
        Normalized composite stress score in the range [0.0, 1.0].
        Derived from a fusion model running on the VR edge device.
    """

    hr: float = Field(..., description="Heart rate in BPM", ge=0.0, le=300.0)
    eda: float = Field(..., description="Electrodermal activity in µS", ge=0.0)
    score: float = Field(
        ..., description="Normalized stress score [0.0 – 1.0]", ge=0.0, le=1.0
    )


class CommandPayload(BaseModel):
    """
    A clinical or automated command that modifies the session state.

    Attributes
    ----------
    action : str
        The specific intervention to execute. Must be one of the
        six defined values to prevent arbitrary state mutations.
    source : str
        Who or what initiated the command — used for audit logging.
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

