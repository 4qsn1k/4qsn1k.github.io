"""Offline contract tests for operator-stepped PR100 DI qualification (no COM port)."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

source = Path(__file__).resolve().parents[1] / "gateway" / "pr100-manual-input-qa.py"
spec = importlib.util.spec_from_file_location("manual_input_qa", source)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class Reply:
    def __init__(self, bits, code, error=False):
        self.bits, self.function_code, self.error = bits, code, error
    def isError(self):
        return self.error


def factory(di, q=None, *, connect=True, invalid_code=False, bad_type=False,
            unstable=False, q_fluctuate=False):
    state = {"clients": [], "reads": 0}
    if q is None:
        q = [True] + [False]*7
    class FakeModbusClient:
        def __init__(self, **kw):
            assert kw == {"port":"COM5", "baudrate":9600, "bytesize":8, "parity":"N",
                          "stopbits":1, "timeout":1.2, "retries":0}
            self.closed = False
            state["clients"].append(self)
        def connect(self):
            return connect
        def close(self):
            self.closed = True
        def read_discrete_inputs(self, *, address, count, device_id):
            assert (address, count, device_id) == (4096, 8, 16)
            state["reads"] += 1
            values = list(di)
            if unstable and state["reads"] == 2:
                values[0] = not values[0]
            if bad_type:
                values[0] = 1
            return Reply(values, 9 if invalid_code else 2)
        def read_coils(self, *, address, count, device_id):
            assert (address, count, device_id) == (0, 8, 16)
            values = list(q)
            if q_fluctuate and state["reads"] > 1:
                values[0] = not values[0]
            return Reply(values, 1)
        def write_coil(self, *a, **kw):
            raise AssertionError("UNEXPECTED_FC05")
        def write_register(self, *a, **kw):
            raise AssertionError("UNEXPECTED_FC06")
        def write_coils(self, *a, **kw):
            raise AssertionError("UNEXPECTED_FC15")
        def write_registers(self, *a, **kw):
            raise AssertionError("UNEXPECTED_FC16")
    return FakeModbusClient, state


def expected_bits(triple):
    return [bool(x) for x in triple] + [False]*5


class TestManualInputQa(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.file = Path(self.tmp.name) / "tomorrow.json"
    def tearDown(self):
        self.tmp.cleanup()
    def execute(self, phase, bits, **opts):
        cls, state = factory(expected_bits(bits), **opts)
        result = qa.execute(phase, self.file, client_class=cls, wait=lambda sec: None)
        self.assertTrue(all(c.closed for c in state["clients"]))
        return result

    def test_complete_five_phase_session(self):
        for phase, triple in qa.PHASES:
            r = self.execute(phase, triple)
            self.assertEqual(r["di"][:3], list(triple))
            self.assertEqual(r["stableDiSamples"], 3)
        data = json.loads(self.file.read_text())
        self.assertEqual(data["status"], "PASS_5_STAGES")
        self.assertEqual([x["phase"] for x in data["history"]],
                         [p for p,_ in qa.PHASES])
        self.assertFalse(data["physicalCommandWrites"])

    def test_wrong_phase_before_baseline_denied_without_port_open(self):
        cls, state = factory(expected_bits((1, 1, 1)))
        with self.assertRaisesRegex(ValueError, "NO_BASELINE_SESSION"):
            qa.execute("di1_open", self.file, cls, wait=lambda t: None)
        self.assertEqual(len(state["clients"]), 0)

    def test_wrong_sequence_after_baseline_denied_without_port_open(self):
        self.execute("baseline", (1,1,1))
        cls, state = factory(expected_bits((1,1,1)))
        with self.assertRaisesRegex(ValueError, "WRONG_PHASE_ORDER"):
            qa.execute("di2_open", self.file, cls, wait=lambda t: None)
        self.assertEqual(len(state["clients"]), 0)

    def test_di1_did_not_open_rejected_and_history_unchanged(self):
        self.execute("baseline", (1,1,1))
        before = self.file.read_bytes()
        cls, state = factory(expected_bits((1,1,1)))
        with self.assertRaisesRegex(ValueError, "DI_MISMATCH"):
            qa.execute("di1_open", self.file, cls, wait=lambda t: None)
        self.assertEqual(before, self.file.read_bytes())
        self.assertTrue(state["clients"][0].closed)

    def test_aps_jumper_must_remain_asserted(self):
        self.execute("baseline", (1,1,1))
        before = self.file.read_bytes()
        cls, state = factory(expected_bits((0,1,0)))
        with self.assertRaisesRegex(ValueError, "DI_MISMATCH"):
            qa.execute("di1_open", self.file, cls, wait=lambda t: None)
        self.assertEqual(before, self.file.read_bytes())
        self.assertTrue(state["clients"][0].closed)

    def test_wrong_reply_fc_rejected_and_port_closed(self):
        cls, state = factory(expected_bits((1,1,1)), invalid_code=True)
        with self.assertRaisesRegex(ValueError, "INVALID_FC_RESPONSE_2"):
            qa.execute("baseline", self.file, cls, wait=lambda t: None)
        self.assertTrue(state["clients"][0].closed)
        self.assertFalse(self.file.exists())

    def test_nonbool_modbus_bit_rejected(self):
        cls, state = factory(expected_bits((1,1,1)), bad_type=True)
        with self.assertRaisesRegex(ValueError, "INVALID_BITS"):
            qa.execute("baseline", self.file, cls, wait=lambda t: None)
        self.assertTrue(state["clients"][0].closed)

    def test_unstable_reed_rejected_not_logged_as_pass(self):
        cls, state = factory(expected_bits((1,1,1)), unstable=True)
        with self.assertRaisesRegex(ValueError, "UNSTABLE_DI"):
            qa.execute("baseline", self.file, cls, wait=lambda t: None)
        self.assertTrue(state["clients"][0].closed)
        self.assertFalse(self.file.exists())

    def test_serial_connect_failure_does_not_write_report(self):
        cls, state = factory(expected_bits((1,1,1)), connect=False)
        with self.assertRaisesRegex(ValueError, "COM5_UNAVAILABLE"):
            qa.execute("baseline", self.file, cls, wait=lambda t: None)
        self.assertTrue(state["clients"][0].closed)
        self.assertFalse(self.file.exists())

    def test_repeated_baseline_cannot_overwrite_report(self):
        self.execute("baseline", (1,1,1))
        before = self.file.read_bytes()
        cls, state = factory(expected_bits((1,1,1)))
        with self.assertRaisesRegex(ValueError, "SESSION_EXISTS_START_NEW_FILE"):
            qa.execute("baseline", self.file, cls, wait=lambda t: None)
        self.assertEqual(before, self.file.read_bytes())
        self.assertFalse(state["clients"])

    def test_changed_old_program_q_is_observed_not_required_to_match(self):
        cls, state = factory(expected_bits((1,1,1)), q_fluctuate=True)
        r = qa.execute("baseline", self.file, cls, wait=lambda t: None)
        self.assertTrue(r["qChangedDuringSamples"])
        self.assertEqual(r["result"], "PASS")
        self.assertTrue(state["clients"][0].closed)

    def test_finished_session_rejects_replay(self):
        for phase, triple in qa.PHASES:
            self.execute(phase, triple)
        cls, state = factory(expected_bits((1,1,1)))
        with self.assertRaisesRegex(ValueError, "WRONG_PHASE_ORDER"):
            qa.execute("di2_restored", self.file, cls, wait=lambda t: None)
        self.assertFalse(state["clients"])

    def test_rejects_symlink_session_without_open(self):
        other = Path(self.tmp.name) / "other.json"
        other.write_text("{}")
        try:
            self.file.symlink_to(other)
        except OSError:
            self.skipTest("Symlinks require privileges on this host")
        cls, state = factory(expected_bits((1,1,1)))
        with self.assertRaisesRegex(ValueError, "SYMLINK_SESSION_FORBIDDEN"):
            qa.execute("baseline", self.file, cls, wait=lambda t: None)
        self.assertFalse(state["clients"])

if __name__ == "__main__":
    unittest.main(verbosity=2)
