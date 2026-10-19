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
    def definition(uid_value, version, name, inputs, outputs):
        return {"Id": uid_value, "LastModificationId": version, "Name": name,
                "InputNames": [f"I{i}" for i in range(inputs)],
                "InputDataTypes": [6] * inputs,
                "OutputNames": [f"O{i}" for i in range(outputs)],
                "OutputDataTypes": [3 if i == 6 else 6 for i in range(outputs)]}
    definitions = [definition(d1, v1, "FB_Room_N1", 5, 13),
                   definition(d4, v4, "FB_Room_N4", 6, 15)]
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
            ports = [pin(f"Input{i}", 0) for i in range(5)] + [pin(f"Output{i}", 1, 3 if i == 6 else 0) for i in range(13)]
        else:
            ports = [pin(f"Input{i}", 0) for i in range(6)] + [pin(f"Output{i}", 1, 3 if i == 6 else 0) for i in range(15)]
        primitives = []
        for port in ports:
            anchor_id = uid()
            port["AnchorUniqueId"] = anchor_id
            port["ElementOwnerUId"] = native.ZERO
            primitives.append({"UniqueId": anchor_id, "Discriminator": 3})
        model = {"Ports": ports, "UniqueId": uid(), "Primitives": primitives}
        if discriminator == 41:
            is_n1 = role == "FB_Room_N1"
            wrapper = {"Discriminator": discriminator, "Name": role,
                       "ElementBlockStoreModel": {"ElementModel": model},
                       "FunctionBlockUId": d1 if is_n1 else d4,
                       "LastModificationId": v1 if is_n1 else v4,
                       "FunctionalBlocksDirectorStoreModel": {
                           "InputNames": [f"I{i}" for i in range(sum(p["PortType"] == 0 for p in ports))],
                           "InputDataTypes": [p["DataType"] for p in ports if p["PortType"] == 0],
                           "InputArrayRanges": [{} for p in ports if p["PortType"] == 0],
                           "OutputNames": [f"O{i}" for i in range(sum(p["PortType"] == 1 for p in ports))],
                           "OutputDataTypes": [p["DataType"] for p in ports if p["PortType"] == 1],
                           "OutputArrayRanges": [{} for p in ports if p["PortType"] == 1],
                       }}
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
            "ToPortUId": b["UniqueId"],
            "Points": [{"IsEmpty": False, "X": 0.0, "Y": 2.0}, {"IsEmpty": False, "X": 5.0, "Y": 2.0}]}})
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
        with self.assertRaisesRegex(ValueError, "NATIVE_PORT_SIGNATURE_MISMATCH"):
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
        with self.assertRaisesRegex(ValueError, "DUPLICATE_NATIVE_UUID"):
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


    def test_wrong_native_direction(self):
        doc, defs = specimen()
        native.model(doc["Elements"][0])["Ports"][0]["PortType"] = 0
        with self.assertRaisesRegex(ValueError, "NATIVE_PORT_SIGNATURE_MISMATCH"):
            native.validate_subset(doc, defs)

    def test_wrong_udint_type(self):
        doc, defs = specimen()
        node = native.model(doc["Elements"][3])
        next(p for p in node["Ports"] if p["Name"] == "Output6")["DataType"] = 0
        with self.assertRaisesRegex(ValueError, "NATIVE_PORT_SIGNATURE_MISMATCH"):
            native.validate_subset(doc, defs)

    def test_missing_native_fb_port(self):
        doc, defs = specimen()
        native.model(doc["Elements"][4])["Ports"].pop()
        with self.assertRaisesRegex(ValueError, "WRONG_NATIVE_PORT_COUNT"):
            native.validate_subset(doc, defs)

    def test_duplicate_native_name(self):
        doc, defs = specimen()
        ps = native.model(doc["Elements"][4])["Ports"]
        ps[1]["Name"] = ps[0]["Name"]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_PORT"):
            native.validate_subset(doc, defs)

    def test_wrong_anchor_reference(self):
        doc, defs = specimen()
        native.model(doc["Elements"][0])["Ports"][0]["AnchorUniqueId"] = uid()
        with self.assertRaisesRegex(ValueError, "DANGLING_ANCHOR_GUID"):
            native.validate_subset(doc, defs)

    def test_anchor_from_other_element(self):
        doc, defs = specimen()
        other_anchor = native.model(doc["Elements"][1])["Ports"][0]["AnchorUniqueId"]
        native.model(doc["Elements"][0])["Ports"][0]["AnchorUniqueId"] = other_anchor
        with self.assertRaisesRegex(ValueError, "DANGLING_ANCHOR_GUID"):
            native.validate_subset(doc, defs)

    def test_native_owner_must_be_zero_sentinel(self):
        doc, defs = specimen()
        native.model(doc["Elements"][0])["Ports"][0]["ElementOwnerUId"] = uid()
        with self.assertRaisesRegex(ValueError, "UNKNOWN_NATIVE_PORT_OWNER"):
            native.validate_subset(doc, defs)

    def test_native_fb_interface_type_drift(self):
        doc, defs = specimen()
        doc["Elements"][3]["FunctionalBlocksDirectorStoreModel"]["OutputDataTypes"][6] = 0
        with self.assertRaisesRegex(ValueError, "FB_NATIVE_INTERFACE_MISMATCH"):
            native.validate_subset(doc, defs)

    def test_native_fb_interface_missing_output(self):
        doc, defs = specimen()
        doc["Elements"][3]["FunctionalBlocksDirectorStoreModel"]["OutputNames"].pop()
        with self.assertRaisesRegex(ValueError, "FB_NATIVE_INTERFACE_MISMATCH"):
            native.validate_subset(doc, defs)

    def test_instance_name_must_match_st_definition(self):
        doc, defs = specimen()
        defs[0]["Name"] = "OtherDefinition"
        with self.assertRaisesRegex(ValueError, "UNRESOLVED_ST_DEFINITION"):
            native.validate_subset(doc, defs)

    def test_unknown_st_definition_id(self):
        doc, defs = specimen()
        doc["Elements"][3]["FunctionBlockUId"] = uid()
        with self.assertRaisesRegex(ValueError, "UNRESOLVED_ST_DEFINITION"):
            native.validate_subset(doc, defs)

    def test_same_element_guid_as_st_definition(self):
        doc, defs = specimen()
        native.model(doc["Elements"][0])["UniqueId"] = defs[0]["Id"]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_NATIVE_UUID"):
            native.validate_subset(doc, defs)

    def test_duplicate_connector_identity(self):
        doc, defs = specimen()
        doc["ConnectorModels"][1]["ConnectorModel"]["UniqueId"] = doc["ConnectorModels"][0]["ConnectorModel"]["UniqueId"]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_NATIVE_UUID"):
            native.validate_subset(doc, defs)

    def test_invalid_uuid_sentinel_as_identity(self):
        doc, defs = specimen()
        native.model(doc["Elements"][0])["UniqueId"] = native.ZERO
        with self.assertRaisesRegex(ValueError, "INVALID_NATIVE_UUID"):
            native.validate_subset(doc, defs)

    def test_invalid_connector_geometry(self):
        doc, defs = specimen()
        doc["ConnectorModels"][0]["ConnectorModel"]["Points"][0]["Y"] = float("inf")
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_CONNECTOR_GEOMETRY"):
            native.validate_subset(doc, defs)

    def test_invalid_connector_geometry_flag(self):
        doc, defs = specimen()
        doc["ConnectorModels"][0]["ConnectorModel"]["Points"][0]["IsEmpty"] = True
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_CONNECTOR_GEOMETRY"):
            native.validate_subset(doc, defs)

    def test_retarget_or_link_to_unconnected_valid_input(self):
        doc, defs = specimen()
        pin = native.model(doc["Elements"][3])["Ports"][0]
        doc["ConnectorModels"][-1]["ConnectorModel"]["ToPortUId"] = pin["UniqueId"]
        with self.assertRaisesRegex(ValueError, "UNVERIFIED_FBD_TOPOLOGY|MULTIPLE_DRIVERS"):
            native.validate_subset(doc, defs)

    def test_duplicate_st_definition_identity(self):
        doc, defs = specimen()
        defs[1]["LastModificationId"] = defs[0]["LastModificationId"]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_NATIVE_UUID"):
            native.validate_subset(doc, defs)



    def test_st_bool_type_namespace_cannot_equal_fbd_code(self):
        doc, defs = specimen()
        defs[0]["InputDataTypes"][0] = 0
        with self.assertRaisesRegex(ValueError, "FB_NATIVE_INTERFACE_MISMATCH"):
            native.validate_subset(doc, defs)

    def test_st_output_udint_must_match_native_type(self):
        doc, defs = specimen()
        defs[1]["OutputDataTypes"][6] = 6
        with self.assertRaisesRegex(ValueError, "FB_NATIVE_INTERFACE_MISMATCH"):
            native.validate_subset(doc, defs)

    def test_st_output_names_cannot_be_reordered(self):
        doc, defs = specimen()
        defs[0]["OutputNames"][0], defs[0]["OutputNames"][1] = (
            defs[0]["OutputNames"][1], defs[0]["OutputNames"][0])
        with self.assertRaisesRegex(ValueError, "FB_NATIVE_INTERFACE_MISMATCH"):
            native.validate_subset(doc, defs)


if __name__ == "__main__":
    unittest.main()
