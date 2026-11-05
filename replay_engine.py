import csv
import time
import requests
import json

SERVER_URL = "http://127.0.0.1:8000/update_telemetry"
CSV_FILE = "replay.csv"

def run_simulation():
    print(f"Starting VR Patient Simulation from {CSV_FILE}...")
    try:
        with open(CSV_FILE, mode='r') as file:
            csv_reader = csv.DictReader(file)
            for row in csv_reader:
                payload = {
                    "hr": float(row["HeartRate"]),
                    "eda": float(row["EDA"]),
                    "score": float(row["StressScore"])
                }
                
                try:
                    response = requests.post(SERVER_URL, json=payload)
                    print(f"Sent: HR={payload['hr']}, EDA={payload['eda']}, Score={payload['score']} | Status: {response.status_code}")
                except Exception as e:
                    print(f"Connection error: {e}")
                
                # Wait 1 second before sending the next row to simulate real-time
                time.sleep(1)
                
        print("Simulation complete.")
    except FileNotFoundError:
        print(f"Error: {CSV_FILE} not found. Please place it in the same directory.")

if __name__ == "__main__":
    run_simulation()