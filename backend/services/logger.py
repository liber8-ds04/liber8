"""
services/logger.py
------------------
EventLogger — dedicated class for structured audit logging to CSV.

Design principles:
  - Single Responsibility: This class does exactly one thing — append an
    immutable event record to the CSV audit log.
  - Append-only: The log is opened in 'a' mode (never 'w') to protect
    historical records from accidental truncation.
  - Thread-safe by design: Each write opens, writes, and immediately closes
    the file handle, minimising lock contention if concurrency is added later.
"""

import csv
import os
from datetime import datetime, timezone

from backend.config import CSV_LOG_PATH


class EventLogger:
    """
    Writes structured event rows to the CSV audit trail.

    Each row captures the full context of a clinical intervention or
    automated system action so that sessions can be reviewed post-hoc.
    """

    # CSV column order — must stay in sync with events.csv header row.
    FIELDNAMES: list[str] = ["Timestamp", "Action", "Source", "CurrentLevel"]

    def __init__(self, log_path: str = CSV_LOG_PATH) -> None:
        """
        Parameters
        ----------
        log_path : str
            Filesystem path to the CSV log file.  Defaults to the value
            defined in config.py so callers don't need to know the detail.
        """
        self._log_path: str = log_path
        self._ensure_file_exists()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _ensure_file_exists(self) -> None:
        """
        Creates the CSV file with a header row if it does not yet exist.
        Called once at instantiation — idempotent if the file is present.
        """
        if not os.path.exists(self._log_path):
            with open(self._log_path, mode="w", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(fh, fieldnames=self.FIELDNAMES)
                writer.writeheader()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def log_event(
        self,
        action: str,
        source: str,
        current_level: str,
    ) -> None:
        """
        Appends a single event row to the CSV audit log.

        Parameters
        ----------
        action : str
            Machine-readable identifier for the event
            (e.g. "auto_step_down", "step_up", "toggle_mode").
        source : str
            Who/what triggered the event ("auto", "doctor", "patient").
        current_level : str
            The VR exposure level active at the time of the event
            (e.g. "Baseline", "Level 1", "Step Down Triggered").
        """
        timestamp: str = datetime.now(tz=timezone.utc).isoformat()

        row: dict[str, str] = {
            "Timestamp": timestamp,
            "Action": action,
            "Source": source,
            "CurrentLevel": current_level,
        }

        with open(self._log_path, mode="a", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=self.FIELDNAMES)
            writer.writerow(row)

