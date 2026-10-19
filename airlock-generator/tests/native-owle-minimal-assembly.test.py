"""Offline only: validation and negative tests for a FIVE-element native TEST subset."""
import copy
import importlib.util
from pathlib import Path
import unittest
import uuid

MODULE = Path(__file__).resolve().parents[1] / "experimental" / "native-minimal-fbd-owle.py"
spec = importlib.util.spec_from_file_location("native_minimal_owle", MODULE)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def uid():
    return str(uuid.uuid4())


def pin(name, direction, dtype=0):
    return {"Name": name, "UniqueId": uid(), "PortType": direction, "DataType": dtype}


def specimen():
    d1, d4 = uid(), uid()
    v1, v4 = uid(), uid()
    definitions = [{"Id": d1, "LastModificationId": v1},
                   {"Id": d4, "LastModificationId": v4}]
    wrappers = []
    byrole = {}
    for role, discriminator in native.ROLES.items():
        if role == "I4":
            ports = [pin("Output0", 1)]
        elif role == "Q4":
            ports = [pin("Input0", 0)]
        elif role == "OR":
            ports = [pin("Input0", 0), pin("Input1", 0), pin("Output2", 1)]
        elif role == "FB_Room_N1":
            ports = [pin(f"Input{i}", 0) for i in range(9)] + [pin(f"Output{i}", 1) for i in range(9)]
        else:
            ports = [pin(f"Input{i}", 0) for i in range(13)] + [pin(f"Output{i}", 1) for i in range(8)]
        model = {"Ports": ports, "UniqueId": uid()}
        if discriminator == 41:
            is_n1 = role == "FB_Room_N1"
            wrapper = {"Discriminator": discriminator, "Name": role,
                       "ElementBlockStoreModel": {"ElementModel": model},
                       "FunctionBlockUId": d1 if is_n1 else d4,
                       "LastModificationId": v1 if is_n1 else v4}
        else:
            wrapper = {"Discriminator": discriminator, "ElementModel": {"Title": role, **model}}
        wrappers.append(wrapper)
        byrole[role] = wrapper
    conns = []
    for sr, sp, tr, tp in native.LINKS:
        a = next(p for p in native.model(byrole[sr])["Ports"] if p["Name"] == sp)
        b = next(p for p in native.model(byrole[tr])["Ports"] if p["Name"] == tp)
        conns.append({"Discriminator": 1, "ConnectorModel": {
            "UniqueId": uid(), "FromPortUId": a["UniqueId"],
            "ToPortUId": b["UniqueId"]}})
    return {"Elements": wrappers, "ConnectorModels": conns}, definitions


class MinimalNativeTest(unittest.TestCase):
    def test_good_topology(self):
        doc, defs = specimen()
        self.assertEqual(native.validate_subset(doc, defs),
                         {"elements": 5, "connectors": 5, "ports": 44, "definitions": 2})

    def test_missing_link(self):
        doc, defs = specimen()
        doc["ConnectorModels"].pop()
        with self.assertRaisesRegex(ValueError, "INVALID_SUBSET_COUNTS"):
            native.validate_subset(doc, defs)

    def test_dangling_port(self):
        doc, defs = specimen()
        doc["ConnectorModels"][0]["ConnectorModel"]["FromPortUId"] = uid()
        with self.assertRaisesRegex(ValueError, "DANGLING_OR_REVERSED_CONNECTOR"):
            native.validate_subset(doc, defs)

    def test_unsupported_code_four(self):
        doc, defs = specimen()
        native.model(doc["Elements"][0])["Ports"][0]["DataType"] = 4
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_NATIVE_PORT_TYPE"):
            native.validate_subset(doc, defs)

    def test_wrong_st_reference(self):
        doc, defs = specimen()
        doc["Elements"][3]["LastModificationId"] = uid()
        with self.assertRaisesRegex(ValueError, "UNRESOLVED_ST_DEFINITION"):
            native.validate_subset(doc, defs)

    def test_duplicate_port_uuid(self):
        doc, defs = specimen()
        ports = native.model(doc["Elements"][3])["Ports"]
        ports[1]["UniqueId"] = ports[0]["UniqueId"]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_PORT"):
            native.validate_subset(doc, defs)

    def test_multiple_drivers(self):
        doc, defs = specimen()
        first, second = doc["ConnectorModels"][:2]
        second["ConnectorModel"]["ToPortUId"] = first["ConnectorModel"]["ToPortUId"]
        with self.assertRaisesRegex(ValueError, "MULTIPLE_DRIVERS"):
            native.validate_subset(doc, defs)

    def test_source_guard(self):
        # Source testing must not require a local vendor archive in CI.
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as tmp:
            p = Path(tmp) / "fabricated.owle"
            p.write_bytes(b"PK\\x03\\x04")
            with self.assertRaisesRegex(ValueError, "UNRECOGNIZED_OR_MODIFIED_SOURCE"):
                native.read_verified_source(p)

    def test_zero_guid_preserved(self):
        self.assertEqual(native.ZERO, "00000000-0000-0000-0000-000000000000")

    def test_output_cannot_overwrite_source(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as tmp:
            p = Path(tmp) / "specimen.owle"
            with self.assertRaisesRegex(ValueError, "INVALID_DESTINATION"):
                native.generate(p, p)


if __name__ == "__main__":
    unittest.main()
