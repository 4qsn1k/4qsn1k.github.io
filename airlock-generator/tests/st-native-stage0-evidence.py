#!/usr/bin/env python3
"""Read-only assertions for a genuine Stage 0 GUI save, not native execution QA."""
import hashlib
import json
from pathlib import Path
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "experimental/issue28/st-acceptance"
PROJECT = BASE / "Airlock_ST00_TimerProbe_VENDOR_20261021.owle"
EXPECTED_SHA = "59e5bea9403c1a6e26724ece4e3791e6505aabb6cd7132c6bb8e9f8b73162336"


def validate(project_bytes):
    import io
    with zipfile.ZipFile(io.BytesIO(project_bytes)) as archive:
        assert archive.testzip() is None, "ZIP_INTEGRITY"
        assert set(archive.namelist()) == {"Project", "StFunctionBlocks"}, "ARCHIVE_MEMBERS"
        documents = json.loads(archive.read("Project"))
        definitions = json.loads(archive.read("StFunctionBlocks"))
    assert len(documents) == len(definitions) == 1, "ONE_PROJECT_ONE_ST_DEFINITION"
    definition = definitions[0]
    assert definition["Name"] == "FB_ST_TimerProbe", "BLOCK_NAME"
    source = definition["SourceCode"].replace("\r\n", "\n").strip()
    assert source == (BASE / "FB_ST_TimerProbe.st").read_text(encoding="utf-8").strip(), "SOURCE_DRIFT"
    assert definition["InputNames"] == ["ENABLE"], "INPUT_SIGNATURE"
    assert definition["OutputNames"] == ["DONE", "FRESH_RISE", "RISE_COUNT"], "OUTPUT_SIGNATURE"
    assert definition["FbInstances"] == [
        {"Name": "Delay", "TemplateName": "SYS.TON", "VariableDataType": 3}
    ], "VENDOR_TIMER_INSTANCE"
    document = next(iter(documents.values()))["DocumentModel"]
    assert len(document["Elements"]) == 43, "ELEMENT_COUNT"
    ports, element_ids = {}, set()
    instances = []
    for wrapper in document["Elements"]:
        element = wrapper.get("ElementModel") or wrapper["ElementBlockStoreModel"]["ElementModel"]
        identity = element["UniqueId"]
        assert uuid.UUID(identity).int and identity not in element_ids, "ELEMENT_ID"
        element_ids.add(identity)
        if wrapper["Discriminator"] == 41:
            instances.append(wrapper)
        for port in element["Ports"]:
            identity = port["UniqueId"]
            assert uuid.UUID(identity).int and identity not in ports, "PORT_ID"
            assert any(p.get("UniqueId") == port["AnchorUniqueId"]
                       for p in element["Primitives"]), "PORT_ANCHOR"
            ports[identity] = (element["Title"], port["Name"])
    assert len(instances) == 1, "ONE_GRAPHICAL_ST_INSTANCE"
    instance = instances[0]
    assert instance["FunctionBlockUId"] == definition["Id"], "INSTANCE_DEFINITION_LINK"
    assert instance["LastModificationId"] == definition["LastModificationId"], "DEFINITION_VERSION"
    wires = document["ConnectorModels"]
    actual = [(ports[w["ConnectorModel"]["FromPortUId"]],
               ports[w["ConnectorModel"]["ToPortUId"]]) for w in wires]
    assert len(actual) == 3 and set(actual) == {
        (("I1", "Output0"), ("FB_ST_TimerProbe", "Input0")),
        (("FB_ST_TimerProbe", "Output0"), ("Q1", "Input0")),
        (("FB_ST_TimerProbe", "Output1"), ("Q2", "Input0")),
    }, "NATIVE_WIRING"


if __name__ == "__main__":
    data = PROJECT.read_bytes()
    assert hashlib.sha256(data).hexdigest() == EXPECTED_SHA, "IMMUTABLE_GUI_CAPTURE_HASH"
    validate(data)
    print("ST00_VENDOR_SAVE_STRUCTURE_PASS 43_ELEMENTS 3_WIRES EXACT_SOURCE SYS.TON")
    print("STRUCTURE_ONLY; compiler and native simulator observations are separate evidence")
