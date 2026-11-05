"""
replay_engine.py
----------------
VR Patient Biometric Simulation Engine for the Liber8 Clinical Dashboard.

Reads a CSV of biometric data (HeartRate, EDA, StressScore, PatientFeedback)
and streams it to the FastAPI /update_telemetry endpoint at 1 Hz in real-time.

Features:
  - Flexibly supports all column casing/naming aliases (hr, HeartRate, HR, eda, score, patient_feedback).
  - Uses CSV 'patient_feedback' values directly if present; otherwise auto-infers from StressScore:
      score < 0.30  -> "Stable"
      score >= 0.85 -> "Overwhelmed"
      otherwise     -> "Challenging"
  - Standard 1-second delay per row to simulate real-time patient streaming.
"""

import csv
import time
import sys

# Prefer requests; fall back to stdlib urllib so the script works anywhere
try:
    import requests as _requests
    def _post(url: str, payload: dict) -> int:
        r = _requests.post(url, json=payload, timeout=4)
        return r.status_code
except ModuleNotFoundError:
    import urllib.request as _urllib_req
    import json as _json
    def _post(url: str, payload: dict) -> int:  # type: ignore[misc]
        data = _json.dumps(payload).encode()
        req = _urllib_req.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with _urllib_req.urlopen(req, timeout=4) as resp:
            return resp.status

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SERVER_URL = "http://127.0.0.1:8000/update_telemetry"
CSV_FILE   = "replay.csv"

# Supported column aliases across datasets
_HR_COLS       = ("HeartRate", "HR", "heart_rate", "hr")
_EDA_COLS      = ("EDA", "Eda", "eda", "GSR", "gsr")
_SCORE_COLS    = ("StressScore", "score", "Score", "stress_score")
_FEEDBACK_COLS = ("PatientFeedback", "patient_feedback", "feedback", "Feedback")


def _resolve_col(row: dict, candidates: tuple, label: str, default: str = None) -> str:
    """
    Returns the raw string value of the first matching column name found in row.
    Raises KeyError if required column is absent and no default is set.
    """
    for name in candidates:
        if name in row and row[name] is not None and str(row[name]).strip() != "":
            return str(row[name]).strip()
    if default is not None:
        return default
    raise KeyError(
        f"[Liber8] CSV missing '{label}' column. "
        f"Expected one of: {candidates}. "
        f"Columns found: {list(row.keys())}"
    )


def _infer_feedback(score: float) -> str:
    """
    Fallback inference for PatientFeedback if missing from CSV row.
    """
    if score < 0.30:
        return "Stable"
    if score >= 0.85:
        return "Overwhelmed"
    return "Challenging"


def run_simulation(csv_file: str = CSV_FILE, server_url: str = SERVER_URL) -> None:
    print(f"[Liber8] Starting VR Patient Simulation from '{csv_file}'...")
    print(f"[Liber8] Target endpoint : {server_url}\n")

    rows_sent = 0
    rows_error = 0

    try:
        with open(csv_file, mode="r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)

            for i, row in enumerate(reader, start=1):
                try:
                    hr_str    = _resolve_col(row, _HR_COLS, "HeartRate")
                    eda_str   = _resolve_col(row, _EDA_COLS, "EDA")
                    score_str = _resolve_col(row, _SCORE_COLS, "StressScore")
                    
                    hr    = float(hr_str)
                    eda   = float(eda_str)
                    score = float(score_str)

                    # Use CSV feedback if present; otherwise infer from score
                    raw_feedback = _resolve_col(row, _FEEDBACK_COLS, "PatientFeedback", default="")
                    feedback = raw_feedback if raw_feedback else _infer_feedback(score)

                except KeyError as exc:
                    print(f"  [ROW {i}] Schema error — {exc}")
                    if i == 1:
                        print("[Liber8] Aborting: first row failed schema check.")
                        sys.exit(1)
                    rows_error += 1
                    time.sleep(1)
                    continue
                except ValueError as exc:
                    print(f"  [ROW {i}] Parse error (non-numeric value) — {exc}")
                    rows_error += 1
                    time.sleep(1)
                    continue

                payload = {
                    "hr": hr,
                    "eda": eda,
                    "score": score,
                    "patient_feedback": feedback,
                }

                try:
                    status = _post(server_url, payload)
                    rows_sent += 1
                    tier = (
                        "✅ STABLE"       if feedback.lower() == "stable"      else
                        "⚠️  CHALLENGING" if feedback.lower() == "challenging" else
                        "🚨 OVERWHELMED"
                    )
                    print(
                        f"  [{i:>4}] HR={hr:>7.1f} BPM  "
                        f"EDA={eda:>6.3f} µS  "
                        f"Score={score:.3f}  "
                        f"{tier:<18}  HTTP {status}"
                    )
                except Exception as conn_exc:
                    rows_error += 1
                    print(f"  [{i:>4}] ⚡ Connection error — {conn_exc}")

                time.sleep(1)

        print(f"\n[Liber8] Simulation complete — {rows_sent} rows sent, {rows_error} errors.")

    except FileNotFoundError:
        print(f"[Liber8] Error: '{csv_file}' not found in the working directory.")
        print(f"         Place {csv_file} in directory and retry.")
        sys.exit(1)
    except Exception as exc:
        print(f"[Liber8] Unexpected error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    csv_arg    = sys.argv[1] if len(sys.argv) > 1 else CSV_FILE
    server_arg = sys.argv[2] if len(sys.argv) > 2 else SERVER_URL
    run_simulation(csv_file=csv_arg, server_url=server_arg)