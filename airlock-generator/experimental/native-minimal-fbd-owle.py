#!/usr/bin/env python3
"""TEST ONLY: assemble a NEW minimal native FBD document from a verified GUI TEST specimen.

No Owen Logic schema is invented. Exactly five vendor-saved wrappers and exactly
five matching native connectors are selected. Non-selected FBD elements are removed.
The output gets fresh UUIDs for every nonzero source identity and preserves ST
definitions and native metadata. Not a generalized graph->OWLE writer.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import stat
import uuid
import zipfile

SOURCE_SHA256 = "0e3f85bfc198aa298ebac5068e76b5c0408cb4590faee9530e74559a1a167a00"
LIMIT = 16 * 1024 * 1024
UUID_PATTERN = re.compile(r"(?i)(?<![a-f0-9])[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}(?![a-f0-9])")
ZERO = str(uuid.UUID(int=0))
LINKS = (
    ("I4", "Output0", "FB_Room_N1", "Input3"),
    ("I4", "Output0", "FB_Room_N4", "Input2"),
    ("FB_Room_N1", "Output8", "OR", "Input0"),
    ("FB_Room_N4", "Output7", "OR", "Input1"),
    ("OR", "Output2", "Q4", "Input0"),
)
ROLES = {"I4": 2, "Q4": 3, "OR": 18, "FB_Room_N1": 41, "FB_Room_N4": 41}


def require(ok, code):
    if not ok:
        raise ValueError(code)


def model(wrapper):
    if wrapper.get("Discriminator") == 41:
        return wrapper["ElementBlockStoreModel"]["ElementModel"]
    return wrapper["ElementModel"]


def role(wrapper):
    if wrapper.get("Discriminator") == 41:
        return wrapper.get("Name")
    return wrapper.get("ElementModel", {}).get("Title")


def read_verified_source(source):
    raw = source.read_bytes()
    require(len(raw) <= LIMIT and hashlib.sha256(raw).hexdigest() == SOURCE_SHA256,
            "UNRECOGNIZED_OR_MODIFIED_SOURCE")
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        require(sorted(i.filename for i in infos) == ["Project", "StFunctionBlocks"], "UNKNOWN_ZIP_MEMBERS")
        require(sum(i.file_size for i in infos) <= LIMIT, "ZIP_EXPANSION_LIMIT")
        for i in infos:
            require(i.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    and not (i.flag_bits & 1) and not stat.S_ISLNK(i.external_attr >> 16),
                    "UNSUPPORTED_ZIP_MEMBER")
        payloads = {i.filename: archive.read(i) for i in infos}  # validates CRC
    project = json.loads(payloads["Project"])
    definitions = json.loads(payloads["StFunctionBlocks"])
    require(isinstance(project, dict) and len(project) == 1
            and isinstance(definitions, list) and len(definitions) == 3, "UNKNOWN_PROJECT_ROOT")
    owner = next(iter(project.values()))
    require(isinstance(owner, dict) and isinstance(owner.get("DocumentModel"), dict), "UNKNOWN_DOCUMENT_PATH")
    return project, definitions, infos


def validate_subset(document, definitions):
    elements, connectors = document["Elements"], document["ConnectorModels"]
    require(len(elements) == 5 and len(connectors) == 5, "INVALID_SUBSET_COUNTS")
    roles = {}
    all_ports = {}
    for wrapper in elements:
        name = role(wrapper)
        require(name in ROLES and name not in roles and wrapper.get("Discriminator") == ROLES[name],
                "UNKNOWN_OR_DUPLICATE_NATIVE_WRAPPER")
        roles[name] = wrapper
        ports = model(wrapper)["Ports"]
        names = set()
        for p in ports:
            require(p["Name"] not in names and p["UniqueId"].lower() not in all_ports,
                    "DUPLICATE_PORT")
            names.add(p["Name"])
            require(p["PortType"] in (0, 1) and p["DataType"] in (0, 3),
                    "UNSUPPORTED_NATIVE_PORT_TYPE")
            all_ports[p["UniqueId"].lower()] = (name, p)
        if wrapper["Discriminator"] == 41:
            matches = [d for d in definitions if str(d.get("Id", "")).lower() ==
                       str(wrapper.get("FunctionBlockUId", "")).lower()]
            require(len(matches) == 1 and
                    str(matches[0].get("LastModificationId", "")).lower() ==
                    str(wrapper.get("LastModificationId", "")).lower(),
                    "UNRESOLVED_ST_DEFINITION")
    require(set(roles) == set(ROLES), "MISSING_NATIVE_WRAPPER")
    edges = set()
    drivers = set()
    for wrapper in connectors:
        require(wrapper.get("Discriminator") == 1, "UNKNOWN_CONNECTOR")
        c = wrapper["ConnectorModel"]
        a, b = all_ports.get(c["FromPortUId"].lower()), all_ports.get(c["ToPortUId"].lower())
        require(a and b and a[1]["PortType"] == 1 and b[1]["PortType"] == 0,
                "DANGLING_OR_REVERSED_CONNECTOR")
        require(a[1]["DataType"] == b[1]["DataType"], "CONNECTOR_TYPE_MISMATCH")
        require(c["ToPortUId"].lower() not in drivers, "MULTIPLE_DRIVERS")
        drivers.add(c["ToPortUId"].lower())
        edges.add((a[0], a[1]["Name"], b[0], b[1]["Name"]))
    require(edges == set(LINKS), "UNVERIFIED_FBD_TOPOLOGY")
    return {"elements": len(elements), "connectors": len(connectors),
            "ports": len(all_ports), "definitions": len(definitions)}


def assemble(project, definitions):
    project = copy.deepcopy(project)
    definitions = copy.deepcopy(definitions)
    document = next(iter(project.values()))["DocumentModel"]
    require(len(document.get("Elements", [])) == 25 and
            len(document.get("ConnectorModels", [])) == 16, "UNEXPECTED_SOURCE_DIAGRAM")
    source_elements = document["Elements"]
    selected = [x for x in source_elements if role(x) in ROLES]
    require(len(selected) == 5, "UNKNOWN_OR_DUPLICATE_SOURCE_ELEMENT")
    ports = {}
    for w in source_elements:
        for p in model(w)["Ports"]:
            require(p["UniqueId"].lower() not in ports, "DUPLICATE_SOURCE_PORT_UUID")
            ports[p["UniqueId"].lower()] = (role(w), p["Name"])
    kept = []
    for w in document["ConnectorModels"]:
        c = w["ConnectorModel"]
        a = ports.get(c["FromPortUId"].lower())
        b = ports.get(c["ToPortUId"].lower())
        if a and b and (*a, *b) in LINKS:
            kept.append(w)
    document["Elements"], document["ConnectorModels"] = selected, kept
    validate_subset(document, definitions)
    source_uuids = set(UUID_PATTERN.findall(json.dumps([project, definitions])))
    mapping = {}

    def rename(match):
        old = match.group(0)
        if old.lower() == ZERO:
            return old
        key = old.lower()
        if key not in mapping:
            mapping[key] = str(uuid.uuid4())
        return mapping[key]

    def remap(value):
        if isinstance(value, dict):
            return {UUID_PATTERN.sub(rename, str(k)): remap(v) for k, v in value.items()}
        if isinstance(value, list):
            return [remap(v) for v in value]
        if isinstance(value, str):
            return UUID_PATTERN.sub(rename, value)
        return value

    transformed, new_defs = remap(project), remap(definitions)
    new_doc = next(iter(transformed.values()))["DocumentModel"]
    summary = validate_subset(new_doc, new_defs)
    result_ids = {v.lower() for v in UUID_PATTERN.findall(json.dumps([transformed, new_defs]))}
    require(not ({x.lower() for x in source_uuids if x.lower() != ZERO} & result_ids),
            "SOURCE_UUID_LEAK")
    require(len(mapping) >= 60, "INCOMPLETE_UUID_REMAP")
    return transformed, new_defs, summary, len(mapping)


def generate(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    require(source != destination and destination.suffix.lower() == ".owle", "INVALID_DESTINATION")
    manifest_path = destination.with_suffix(".owle.manifest.json")
    require(not destination.exists() and not manifest_path.exists(), "DESTINATION_ALREADY_EXISTS")
    project, definitions, infos = read_verified_source(source)
    new_project, new_defs, summary, remapped = assemble(project, definitions)
    members = {"Project": json.dumps(new_project, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
               "StFunctionBlocks": json.dumps(new_defs, ensure_ascii=False, separators=(",", ":")).encode("utf-8")}
    created = False
    try:
        with destination.open("xb") as handle:
            created = True
            with zipfile.ZipFile(handle, "w") as output:
                for info in infos:
                    output.writestr(info, members[info.filename])
        with zipfile.ZipFile(destination) as check:
            require(check.testzip() is None, "WRITTEN_ZIP_CRC_ERROR")
            require(json.loads(check.read("Project")) == new_project, "WRITTEN_PROJECT_MISMATCH")
            require(json.loads(check.read("StFunctionBlocks")) == new_defs, "WRITTEN_ST_MISMATCH")
        require(hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA256,
                "SOURCE_CHANGED_DURING_EXPORT")
        manifest = {"schema": "airlock-owle-native-minimal-test/1",
                    "status": "NATIVE_DOCUMENT_GENERATED_UNVERIFIED",
                    "subset": "TWO_ROOM_SHARED_I4_NATIVE_OR_OBSERVER_ONLY",
                    "sourceSha256": SOURCE_SHA256,
                    "outputSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
                    "remappedUniqueNonzeroUuids": remapped,
                    "counts": summary, "excludedUnsupportedNativePortTypes": [4],
                    "nativeGui": "NEEDS_NATIVE_GUI",
                    "arbitraryGraphSupported": False, "physical": "PHYSICAL_NOT_TESTED"}
        with manifest_path.open("x", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2)
        return manifest
    except Exception:
        if created and destination.exists():
            destination.unlink()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("destination")
    args = parser.parse_args()
    try:
        print(json.dumps(generate(args.source, args.destination), indent=2))
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise SystemExit(str(exc)) from None


if __name__ == "__main__":
    main()
