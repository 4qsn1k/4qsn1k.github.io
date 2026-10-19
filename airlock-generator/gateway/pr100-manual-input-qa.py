#!/usr/bin/env python3
"""Operator-stepped, read-only PR100 DI1/DI2 contact test; no PLC writes.

Each invocation checks one *manually confirmed* phase. No polling daemon,
actuator operations, configuration writes or automatic field I/O stimulation.
This script cannot establish egress or fire alarm safety.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
import time

SCHEMA = "airlock-pr100-manual-di-qa/1"
# Each tuple contains the expected DI1, DI2, DI3 bits at the test bench.
PHASES = (
    ("baseline", (1, 1, 1)),
    ("di1_open", (0, 1, 1)),
    ("di1_restored", (1, 1, 1)),
    ("di2_open", (1, 0, 1)),
    ("di2_restored", (1, 1, 1)),
)
EXPECTED = dict(PHASES)


def insist(ok, message):
    if not ok:
        raise ValueError(message)


def validate_response(response, function_code):
    insist(response is not None and response.isError() is False and
           getattr(response, "function_code", None) == function_code,
           "INVALID_FC_RESPONSE_" + str(function_code))
    bits = getattr(response, "bits", None)
    insist(isinstance(bits, (list, tuple)) and len(bits) >= 8 and
           all(type(x) is bool for x in bits[:8]), "INVALID_BITS")
    return [int(x) for x in bits[:8]]


def single_sample(client):
    di = validate_response(
        client.read_discrete_inputs(address=4096, count=8, device_id=16), 2)
    q = validate_response(client.read_coils(address=0, count=8, device_id=16), 1)
    return {"di": di, "q": q}


def read_three(client_class=None, wait=time.sleep):
    if client_class is None:
        from pymodbus.client import ModbusSerialClient
        client_class = ModbusSerialClient
    client = client_class(port="COM5", baudrate=9600, bytesize=8,
                          parity="N", stopbits=1, timeout=1.2, retries=0)
    try:
        insist(client.connect() is True, "COM5_UNAVAILABLE")
        samples = []
        for index in range(3):
            samples.append(single_sample(client))
            if index < 2:
                wait(0.3)
        insist(all(item["di"] == samples[0]["di"] for item in samples),
               "UNSTABLE_DI")
        return samples
    finally:
        client.close()


def validate_phase(phase, samples, history):
    insist(phase in EXPECTED, "UNKNOWN_PHASE")
    stages = [item["phase"] for item in history]
    insist(stages == [name for name, _ in PHASES[:len(stages)]],
           "INVALID_HISTORY")
    insist(phase == PHASES[len(stages)][0] if len(stages) < len(PHASES)
           else False, "WRONG_PHASE_ORDER")
    observed = tuple(samples[0]["di"][:3])
    insist(all(x["di"] == samples[0]["di"] for x in samples), "UNSTABLE_DI")
    insist(observed == EXPECTED[phase],
           "DI_MISMATCH expected=" + str(EXPECTED[phase]) + " observed=" + str(observed))
    # DI3 must stay at one throughout; do NOT open or remove the APS jumper.
    return {"phase": phase, "timeUtc": datetime.now(timezone.utc).isoformat(),
            "di": samples[0]["di"], "q": samples[0]["q"],
            "stableDiSamples": len(samples),
            "qChangedDuringSamples": any(x["q"] != samples[0]["q"] for x in samples),
            "result": "PASS"}


def load_history(file, phase):
    insist(file.suffix.lower() == ".json", "SESSION_MUST_BE_JSON")
    insist(not file.is_symlink(), "SYMLINK_SESSION_FORBIDDEN")
    if phase == "baseline":
        insist(not file.exists(), "SESSION_EXISTS_START_NEW_FILE")
        return []
    insist(file.is_file(), "NO_BASELINE_SESSION")
    payload = json.loads(file.read_text(encoding="utf-8"))
    insist(payload.get("schema") == SCHEMA and
           payload.get("port") == "COM5" and payload.get("slave") == 16 and
           isinstance(payload.get("history"), list), "INVALID_SESSION_SCHEMA")
    return payload["history"]


def persist(file, history, phase):
    payload = {"schema": SCHEMA, "port": "COM5", "slave": 16,
               "protocol": "MODBUS_RTU_READ_ONLY_FC01_FC02",
               "physicalCommandWrites": False,
               "operatorManuallyChangedInputs": True,
               "phase": phase, "history": history,
               "status": "PASS_5_STAGES" if len(history) == len(PHASES)
                         else "PARTIAL_QUALIFICATION"}
    # Existing sessions are updated only after successful verification.
    if len(history) == 1:
        with file.open("x", encoding="utf-8") as out:
            json.dump(payload, out, indent=2)
    else:
        tmp = file.with_suffix(".json.tmp")
        insist(not tmp.exists(), "TEMP_FILE_EXISTS")
        try:
            with tmp.open("x", encoding="utf-8") as out:
                json.dump(payload, out, indent=2)
            os.replace(tmp, file)
        finally:
            if tmp.exists():
                tmp.unlink()


def execute(phase, file, client_class=None, wait=time.sleep):
    history = load_history(file, phase)
    insist(len(history) < len(PHASES) and phase == PHASES[len(history)][0],
           "WRONG_PHASE_ORDER")
    samples = read_three(client_class, wait)
    record = validate_phase(phase, samples, history)
    persist(file, history + [record], phase)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", required=True, choices=tuple(EXPECTED))
    parser.add_argument("--session", required=True, type=Path)
    args = parser.parse_args()
    try:
        record = execute(args.phase, args.session)
        print(json.dumps({"phase": record["phase"], "result": record["result"],
              "DI1_DI2_DI3": record["di"][:3], "Q1_Q8": record["q"],
              "QChangedDuringRead": record["qChangedDuringSamples"],
              "PORT_CLOSED": True}, ensure_ascii=False))
        return 0
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError) as error:
        print("NOT_PASSED:", str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
