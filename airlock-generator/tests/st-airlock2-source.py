#!/usr/bin/env python3
"""Execute actual Issue #28 ST source with host-only TON test doubles.

These checks are HOST_ST_SUBSET_ONLY_NOT_OWEN, not Save As/Compile/Simulator
acceptance. No device, serial, network or vendor-project writes are performed.
"""

import hashlib
import json
from pathlib import Path
import sys
import unittest

from st_source_runtime import Parser, QUALIFICATION, Runtime, STError


ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILE = ROOT / "experimental/issue28/st-acceptance/FB_Airlock2.st"
PROBE_FILE = SOURCE_FILE.with_name("FB_ST_TimerProbe.st")
ORACLE_FILE = ROOT / "experimental/issue28/ST_REFERENCE_VECTORS_OFFLINE.json"
SOURCE = SOURCE_FILE.read_text(encoding="utf-8")
ORACLE_BYTES = ORACLE_FILE.read_bytes()
ORACLE = json.loads(ORACLE_BYTES)
INITIAL = {"CLOSED_A": True, "CLOSED_B": True, "REQUEST_A": False,
           "REQUEST_B": False, "FIRE_NORMAL": True, "RESET": False,
           "DATA_HEALTHY": True}


class Rig:
    def __init__(self, source=SOURCE):
        self.runtime = Runtime(source)
        self.now = 0
        self.last = None

    def step(self, changes=None, advance_ms=0):
        """Apply changes, scan, then advance in <=20ms host scan intervals."""
        self.last = self.runtime.scan(changes, self.now)
        end = self.now + advance_ms
        while self.now < end:
            self.now = min(end, self.now + 20)
            self.last = self.runtime.scan({}, self.now)
        return self.last

    def ready(self, initial=None):
        return self.step({**INITIAL, **(initial or {})}, 10000)


class ActualSourceTests(unittest.TestCase):
    def assert_off(self, value):
        self.assertFalse(value["PERMIT_A"])
        self.assertFalse(value["PERMIT_B"])

    def assert_no_conflict(self, value):
        self.assertFalse(value["PERMIT_A"] and value["PERMIT_B"])
        if value["FAULT"] or value["EMERGENCY"]:
            self.assert_off(value)

    def test_01_entire_source_is_parsed_and_inputs_are_exact(self):
        program = Parser(SOURCE).parse()
        self.assertEqual(program.name, "FB_AIRLOCK2")
        self.assertEqual({n for n, v in program.variables.items() if v.section == "VAR_INPUT"}, set(INITIAL))
        self.assertEqual(sum(v.kind == "SYS.TON" for v in program.variables.values()), 4)
        self.assertEqual(Runtime.qualification, "HOST_ST_SUBSET_ONLY_NOT_OWEN")

    def test_02_all_eleven_frozen_two_door_vectors(self):
        self.assertEqual(hashlib.sha256(ORACLE_BYTES).hexdigest(),
                         "47abf35e5dd482530127306175cd0a47642a2d7849f5a400c0bf0584535a8173",
                         "baseline 6dc6481 oracle must remain unchanged")
        rig = Rig()
        for vector in ORACLE["twoDoorTrace"]:
            with self.subTest(label=vector["label"]):
                actual = rig.step(vector["changes"], vector["advanceMs"])
                mapped = {"timeMs": rig.now,
                          "permit": {"A": actual["PERMIT_A"], "B": actual["PERMIT_B"]},
                          "ready": {"AB": actual["READY"]},
                          "reserved": {"A": actual["RESERVED_A"], "B": actual["RESERVED_B"]},
                          "fault": actual["FAULT"], "buzzer": actual["BUZZER"],
                          "emergency": actual["EMERGENCY"],
                          "overtime": {"A": actual["OVERTIME_A"], "B": actual["OVERTIME_B"]}}
                self.assertEqual(mapped, vector["expected"])
        self.assertEqual(ORACLE_FILE.read_bytes(), ORACLE_BYTES, "immutable oracle changed")

    def test_03_priority_and_reservation_before_reed_moves(self):
        rig = Rig()
        rig.ready()
        value = rig.step({"REQUEST_A": True, "REQUEST_B": True})
        self.assertTrue(value["PERMIT_A"])
        self.assertTrue(value["RESERVED_A"])
        self.assertFalse(value["PERMIT_B"])
        self.assertFalse(value["RESERVED_B"])
        self.assertEqual(value["STATE_CODE"], 20)
        rig.step({"REQUEST_A": False})
        self.assert_off(rig.step({}, 20000))
        rig.step({"REQUEST_B": False})
        self.assertTrue(rig.step({"REQUEST_B": True})["PERMIT_B"])

    def test_04_each_startup_held_request_needs_low_and_fresh_rise(self):
        for door in ("A", "B"):
            with self.subTest(door=door):
                rig = Rig()
                self.assert_off(rig.ready({"REQUEST_" + door: True}))
                self.assert_off(rig.step({}, 30000))
                rig.step({"REQUEST_" + door: False})
                self.assertTrue(rig.step({"REQUEST_" + door: True})["PERMIT_" + door])

    def test_05_request_during_dwell_is_consumed(self):
        rig = Rig()
        rig.step(INITIAL, 9000)
        self.assert_off(rig.step({"REQUEST_B": True}, 20000))
        rig.step({"REQUEST_B": False})
        self.assertTrue(rig.step({"REQUEST_B": True})["PERMIT_B"])

    def test_06_fresh_request_exactly_at_dwell_boundary(self):
        rig = Rig()
        rig.step(INITIAL, 9980)
        # One actual scan at 10s, with the edge first sampled at that instant.
        rig.now = 10000
        value = rig.step({"REQUEST_A": True})
        self.assertTrue(value["PERMIT_A"])
        self.assertEqual(value["STATE_CODE"], 20)

    def test_07_unused_grant_exact_five_second_output_bound(self):
        for door in ("A", "B"):
            with self.subTest(door=door):
                rig = Rig()
                rig.ready()
                self.assertTrue(rig.step({"REQUEST_" + door: True}, 4999)["PERMIT_" + door])
                value = rig.step({}, 1)
                self.assert_off(value)
                # State cleanup intentionally follows Q-based output cutoff.
                value = rig.step({}, 20)
                self.assertFalse(value["RESERVED_" + door])
                self.assert_off(rig.step({}, 20000))
                rig.step({"REQUEST_" + door: False})
                self.assertTrue(rig.step({"REQUEST_" + door: True})["PERMIT_" + door])

    def test_08_release_cancels_without_fake_open_close_dwell(self):
        rig = Rig()
        rig.ready()
        rig.step({"REQUEST_A": True})
        value = rig.step({"REQUEST_A": False})
        self.assert_off(value)
        self.assertFalse(value["RESERVED_A"])
        self.assertTrue(value["READY"])
        self.assertTrue(rig.step({"REQUEST_B": True})["PERMIT_B"])

    def test_09_cancel_and_competing_rise_same_scan_is_consumed(self):
        rig = Rig()
        rig.ready()
        rig.step({"REQUEST_A": True})
        self.assert_off(rig.step({"REQUEST_A": False, "REQUEST_B": True}))
        self.assert_off(rig.step({}, 20000))
        rig.step({"REQUEST_B": False})
        self.assertTrue(rig.step({"REQUEST_B": True})["PERMIT_B"])

    def test_10_observed_open_wins_same_scan_button_release(self):
        for door in ("A", "B"):
            with self.subTest(door=door):
                rig = Rig()
                rig.ready()
                rig.step({"REQUEST_" + door: True})
                value = rig.step({"CLOSED_" + door: False, "REQUEST_" + door: False})
                self.assert_off(value)
                self.assertTrue(value["RESERVED_" + door])
                self.assertTrue(rig.step({}, 10000)["RESERVED_" + door])
                self.assertFalse(rig.step({"CLOSED_" + door: True})["RESERVED_" + door])

    def test_11_each_open_close_requires_full_hold_and_reopen_restarts(self):
        for door in ("A", "B"):
            with self.subTest(door=door):
                rig = Rig()
                rig.ready()
                rig.step({"REQUEST_" + door: True})
                self.assert_off(rig.step({"CLOSED_" + door: False}, 40))
                self.assertFalse(rig.step({"CLOSED_" + door: True, "REQUEST_" + door: False}, 9900)["READY"])
                self.assertTrue(rig.step({}, 100)["READY"])
                rig.step({"CLOSED_" + door: False}, 20)
                rig.step({"CLOSED_" + door: True}, 9900)
                rig.step({"CLOSED_" + door: False}, 20)
                self.assertFalse(rig.step({"CLOSED_" + door: True}, 9900)["READY"])
                self.assertTrue(rig.step({}, 100)["READY"])

    def test_12_overtime_exact_thirty_seconds_and_clear_on_close(self):
        for door in ("A", "B"):
            with self.subTest(door=door):
                rig = Rig()
                rig.ready()
                self.assertFalse(rig.step({"CLOSED_" + door: False}, 29999)["BUZZER"])
                value = rig.step({}, 1)
                self.assertTrue(value["OVERTIME_" + door])
                self.assertTrue(value["BUZZER"])
                self.assertFalse(rig.step({"CLOSED_" + door: True})["BUZZER"])

    def test_13_forced_open_pair_latches_and_close_does_not_recover(self):
        rig = Rig()
        rig.ready()
        value = rig.step({"CLOSED_A": False, "CLOSED_B": False})
        self.assertTrue(value["FAULT"])
        self.assertTrue(value["BUZZER"])
        self.assert_off(value)
        self.assertTrue(rig.step({"CLOSED_A": True, "CLOSED_B": True}, 20000)["FAULT"])

    def test_14_recovery_reset_requires_fresh_edge_and_new_full_hold(self):
        rig = Rig()
        rig.ready()
        rig.step({"CLOSED_A": False, "CLOSED_B": False, "RESET": True})
        self.assertTrue(rig.step({"CLOSED_A": True, "CLOSED_B": True}, 20000)["FAULT"])
        rig.step({"RESET": False})
        value = rig.step({"RESET": True})
        self.assertFalse(value["FAULT"])
        self.assertFalse(value["READY"])
        self.assertEqual(value["STATE_CODE"], 0)
        # Recovery scan explicitly resets TON; next scan starts a full hold.
        rig.step({"RESET": False})
        self.assertFalse(rig.step({}, 9900)["READY"])
        self.assertTrue(rig.step({}, 100)["READY"])

    def test_15_each_emergency_source_revokes_and_requires_manual_recovery(self):
        for signal in ("FIRE_NORMAL", "DATA_HEALTHY"):
            with self.subTest(signal=signal):
                rig = Rig()
                rig.ready()
                rig.step({"REQUEST_A": True})
                value = rig.step({signal: False})
                self.assert_off(value)
                self.assertTrue(value["FAULT"])
                self.assertEqual(value["EMERGENCY"], signal == "FIRE_NORMAL")
                self.assertTrue(rig.step({signal: True, "RESET": True}, 20000)["FAULT"])
                self.assertTrue(rig.step({"REQUEST_A": False}, 20000)["FAULT"])
                rig.step({"RESET": False})
                self.assertFalse(rig.step({"RESET": True})["FAULT"])
                rig.step({"RESET": False}, 10000)
                self.assert_off(rig.last)
                self.assertTrue(rig.step({"REQUEST_A": True})["PERMIT_A"])

    def test_16_startup_reset_held_high_cannot_clear_initial_fault(self):
        rig = Rig()
        rig.step({**INITIAL, "FIRE_NORMAL": False, "RESET": True})
        self.assertTrue(rig.step({"FIRE_NORMAL": True}, 20000)["FAULT"])
        rig.step({"RESET": False})
        self.assertFalse(rig.step({"RESET": True})["FAULT"])

    def test_17_open_at_grant_timeout_wins_but_never_leaves_permit(self):
        rig = Rig()
        rig.ready()
        rig.step({"REQUEST_A": True}, 4980)
        rig.now += 20
        value = rig.step({"CLOSED_A": False, "REQUEST_A": False})
        self.assert_off(value)
        self.assertTrue(value["RESERVED_A"])
        self.assertEqual(value["STATE_CODE"], 21)

    def test_18_unselected_forced_open_cancels_unused_owner(self):
        rig = Rig()
        rig.ready()
        rig.step({"REQUEST_A": True})
        value = rig.step({"CLOSED_B": False})
        self.assert_off(value)
        self.assertFalse(value["RESERVED_A"])
        self.assertFalse(value["FAULT"])
        self.assertFalse(value["READY"])

    def test_19_restart_discards_owner_and_rejects_held_request(self):
        rig = Rig()
        rig.ready()
        rig.step({"REQUEST_A": True})
        restarted = Rig()
        self.assert_off(restarted.ready({"REQUEST_A": True}))
        self.assertFalse(restarted.last["RESERVED_A"])
        restarted.step({"REQUEST_A": False})
        self.assertTrue(restarted.step({"REQUEST_A": True})["PERMIT_A"])

    def test_20_invalid_state_is_latched_fault(self):
        rig = Rig()
        rig.ready()
        rig.runtime.set_local_for_fault_injection("State", 1234)
        value = rig.step({"REQUEST_A": True})
        self.assert_off(value)
        self.assertTrue(value["FAULT"])
        self.assertEqual(value["STATE_CODE"], 90)

    def test_24_corrupt_state_and_fresh_reset_cannot_hide_same_scan_fault(self):
        rig = Rig()
        rig.ready()
        rig.runtime.set_local_for_fault_injection("State", 1234)
        value = rig.step({"RESET": True})
        self.assertTrue(value["FAULT"], "new invalid-state fault must dominate simultaneous Reset")
        self.assert_off(value)
        self.assertEqual(value["STATE_CODE"], 90)
        rig.step({"RESET": False})
        self.assertFalse(rig.step({"RESET": True})["FAULT"])
        rig.step({"RESET": False}, 9999)
        self.assertFalse(rig.last["READY"])
        self.assertTrue(rig.step({}, 1)["READY"])

    def test_21_deterministic_adverse_scan_sequences_preserve_invariants(self):
        rig = Rig()
        scan = rig.runtime.scan
        checked_scans = 0

        def checked_scan(*args, **kwargs):
            nonlocal checked_scans
            value = scan(*args, **kwargs)
            checked_scans += 1
            self.assert_no_conflict(value)
            if value["PERMIT_A"] or value["PERMIT_B"]:
                for signal in ("CLOSED_A", "CLOSED_B", "FIRE_NORMAL", "DATA_HEALTHY"):
                    self.assertTrue(rig.runtime.values[signal])
            return value

        # Check each intermediate scan too, including long recovery dwells.
        rig.runtime.scan = checked_scan
        rig.ready()
        seed = 28
        successful_grants = 0
        for index in range(3000):
            seed = (1664525 * seed + 1013904223) & 0xFFFFFFFF
            inputs = {"REQUEST_A": bool(seed & 1), "REQUEST_B": bool(seed & 2),
                      "CLOSED_A": bool(seed & 4), "CLOSED_B": bool(seed & 8),
                      "RESET": index % 31 == 1,
                      "FIRE_NORMAL": index % 137 != 0,
                      "DATA_HEALTHY": index % 173 != 0}
            phase = index % 100
            # Repeatedly recover and re-enter service: a permanently latched
            # fault would make the no-conflict invariant nearly vacuous.
            if phase in (0, 1, 2):
                inputs = {**INITIAL, "RESET": phase == 1}
            elif phase == 3:
                inputs = {**INITIAL, "REQUEST_A": True, "REQUEST_B": True}
            value = rig.step(inputs, 10000 if phase == 2 else 20)
            self.assert_no_conflict(value)
            if value["PERMIT_A"] or value["PERMIT_B"]:
                successful_grants += 1
                self.assertTrue(inputs["CLOSED_A"] and inputs["CLOSED_B"])
                self.assertTrue(inputs["FIRE_NORMAL"] and inputs["DATA_HEALTHY"])
        self.assertGreaterEqual(successful_grants, 30)
        self.assertGreater(checked_scans, 3000)

    def test_22_source_mutations_are_detected_by_behavior_assertions(self):
        # Demonstrate these are behavior tests, not source-string snapshots.
        mutant = SOURCE.replace("ELSIF FreshB THEN State := 30;", "ELSIF FreshB THEN State := 20;")
        self.assertNotEqual(mutant, SOURCE)
        rig = Rig(mutant)
        rig.ready()
        self.assertFalse(rig.step({"REQUEST_B": True})["PERMIT_B"])
        mutant = SOURCE.replace("T := T#10s", "T := T#9s")
        rig = Rig(mutant)
        self.assertTrue(rig.step(INITIAL, 9900)["READY"], "9s mutation should violate 9.9s expected hold")

    def test_23_timer_probe_executes_actual_source(self):
        runtime = Runtime(PROBE_FILE.read_text(encoding="utf-8"))
        self.assertFalse(runtime.scan({"ENABLE": True}, 0)["FRESH_RISE"])
        self.assertFalse(runtime.scan({}, 9999)["DONE"])
        self.assertTrue(runtime.scan({}, 10000)["DONE"])
        self.assertFalse(runtime.scan({"ENABLE": False}, 10001)["DONE"])
        value = runtime.scan({"ENABLE": True}, 10002)
        self.assertTrue(value["FRESH_RISE"])
        self.assertEqual(value["RISE_COUNT"], 1)
        self.assertFalse(runtime.scan({}, 10003)["FRESH_RISE"])
        self.assertFalse(runtime.scan({}, 20001)["DONE"])
        self.assertTrue(runtime.scan({}, 20002)["DONE"])


class HarnessStrictnessTests(unittest.TestCase):
    def test_unknown_tokens_and_statements_rejected_even_in_dead_branch(self):
        for mutation in ("@", "RETURN;", "WHILE TRUE DO END_WHILE;", "Typo := FALSE;"):
            with self.subTest(mutation=mutation):
                with self.assertRaises(STError):
                    Runtime(SOURCE.replace("END_FUNCTION_BLOCK", f"IF FALSE THEN {mutation} END_IF;\nEND_FUNCTION_BLOCK"))

    def test_timer_unknown_fields_and_arguments_rejected(self):
        for old, new in (("HoldTimer.Q", "HoldTimer.ET"),
                         ("I := AllClosed", "IN := AllClosed"),
                         ("SYS.TON", "SYS.TOF")):
            with self.subTest(new=new):
                with self.assertRaises(STError):
                    Runtime(SOURCE.replace(old, new))

    def test_timer_call_skips_and_duplicates_rejected(self):
        call = "OpenTimerA(I := NOT CLOSED_A, T := T#30s);"
        for replacement in ("", call + "\n" + call):
            with self.subTest(replacement=replacement):
                with self.assertRaises(STError):
                    Rig(SOURCE.replace(call, replacement)).step(INITIAL)

    def test_invalid_inputs_and_clock_rejected(self):
        runtime = Runtime(SOURCE)
        with self.assertRaises(STError):
            runtime.scan({"CLOSED_A": 1})
        with self.assertRaises(STError):
            runtime.scan({"UNKNOWN": False})
        runtime.scan(INITIAL, 10)
        with self.assertRaises(STError):
            runtime.scan({}, 9)


if __name__ == "__main__":
    print(f"{QUALIFICATION} source_sha256={hashlib.sha256(SOURCE_FILE.read_bytes()).hexdigest()}", flush=True)
    print("Actual ST source; four TON test doubles; immutable 11-step oracle; native QA still required.", flush=True)
    # Windows PowerShell 5 with ErrorActionPreference=Stop can treat native
    # stderr output as an error record even for successful unittest progress.
    unittest.main(testRunner=unittest.TextTestRunner(stream=sys.stdout, verbosity=2))
