"""
state_manager.py
----------------
Compatibility re-export module for ClinicalStateManager.
"""

from backend.services.state_manager import (
    ClinicalStateManager,
    EXPOSURE_LEVELS,
    FALLBACK_SAFE_ROOM,
)

__all__ = ["ClinicalStateManager", "EXPOSURE_LEVELS", "FALLBACK_SAFE_ROOM"]

