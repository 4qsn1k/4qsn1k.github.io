#!/usr/bin/env python3
"""Read-only ZIP/JSON envelope inspection, never extraction or native acceptance.

Project member/document nesting is not specified by the published specimen.
Only discover literal DocumentModel keys; do not guess an archive write layout.
Output whitelisted counts, names of known members and hashes; no raw source/IDs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import uuid
import re
import zipfile
import struct

LIMIT = 16 * 1024 * 1024
MEMBERS = {"Project", "StFunctionBlocks"}


def require(ok, code):
    if not ok:
        raise ValueError(code)


def object_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def discover(value, documents, depth=0):
    require(depth < 128, "JSON_NESTING_LIMIT")
    if isinstance(value, dict):
        if "DocumentModel" in value:
            require(isinstance(value["DocumentModel"], dict), "INVALID_DOCUMENT_MODEL")
            documents.append(value["DocumentModel"])
        for child in value.values():
            discover(child, documents, depth + 1)
    elif isinstance(value, list):
        for child in value:
            discover(child, documents, depth + 1)


def inspect_document(document, fixture):
    require(set(document).issubset(fixture["documentKeys"]), "UNKNOWN_DOCUMENT_FIELDS")
    require(isinstance(document.get("Elements"), list) and isinstance(document.get("ConnectorModels"), list), "INCOMPLETE_DOCUMENT")
    identities, ports, or_inputs = set(), {}, []
    shapes = {tuple(sorted(shape)) for e in fixture["examples"] for shape in e["primitiveFieldShapes"]}
    # Numeric primitive discriminators come from the older complete GUI fixture.
    signatures = json.loads((Path(__file__).resolve().parents[1] / "experimental/fixtures/fbd-two-native-blocks.sample.json").read_text())
    primitive_codes = {(p["Discriminator"], tuple(sorted(p))) for e in signatures["elements"]
                       for p in e["ElementBlockStoreModel"]["ElementModel"]["Primitives"]}
    examples = {e["discriminator"]: e for e in fixture["examples"]}

    def identity(value):
        try:
            parsed = uuid.UUID(value)
        except (ValueError, TypeError, AttributeError):
            raise ValueError("INVALID_UUID") from None
        require(str(parsed) == value.lower() and parsed.int != 0, "INVALID_UUID")
        require(parsed not in identities, "DUPLICATE_UUID")
        identities.add(parsed)
        return parsed

    def reference(value):
        try:
            return uuid.UUID(value)
        except (ValueError, TypeError, AttributeError):
            raise ValueError("INVALID_UUID_REFERENCE") from None

    if "UniqueId" in document:
        identity(document["UniqueId"])
    unresolved_instances = 0
    for wrapper in document["Elements"]:
        require(isinstance(wrapper, dict) and wrapper.get("Discriminator") in examples, "UNSUPPORTED_NATIVE_ELEMENT")
        example = examples[wrapper["Discriminator"]]
        require(set(wrapper) == set(example["wrapperKeys"]), "UNKNOWN_ELEMENT_WRAPPER")
        if wrapper["Discriminator"] == 41:
            unresolved_instances += 1  # Full definition/instance metadata has not been published.
            block = wrapper["ElementBlockStoreModel"]
            require(set(block) == {"ElementModel", "Identificator"}, "UNKNOWN_FB_WRAPPER")
            model = block["ElementModel"]
        else:
            model = wrapper["ElementModel"]
        require(set(model) == set(example["elementModelKeys"]), "UNKNOWN_ELEMENT_MODEL")
        identity(model["UniqueId"])
        require(isinstance(model["Ports"], list) and isinstance(model["Primitives"], list), "INVALID_ELEMENT_ARRAYS")
        anchors, names = set(), set()
        interface = wrapper.get("FunctionalBlocksDirectorStoreModel")
        if interface is not None:
            require(set(interface) == {"InputNames", "InputDataTypes", "InputArrayRanges", "OutputNames", "OutputDataTypes", "OutputArrayRanges"}, "UNKNOWN_FB_INTERFACE")
            for prefix in ("Input", "Output"):
                require(isinstance(interface[prefix + "Names"], list) and
                        len(interface[prefix + "Names"]) == len(interface[prefix + "DataTypes"]) == len(interface[prefix + "ArrayRanges"]), "INCOMPLETE_FB_INTERFACE")
        for primitive in model["Primitives"]:
            require(isinstance(primitive, dict) and tuple(sorted(primitive)) in shapes
                    and (primitive.get("Discriminator"), tuple(sorted(primitive))) in primitive_codes, "UNKNOWN_PRIMITIVE_SHAPE")
            if "UniqueId" in primitive:
                anchors.add(identity(primitive["UniqueId"]))
        for port in model["Ports"]:
            require(set(port) == {"UniqueId", "AnchorUniqueId", "ElementOwnerUId", "PortType", "DataType", "IsFloating", "Name", "PointIndexMode", "ArrayType"}, "UNKNOWN_NATIVE_PORT_FIELDS")
            port_id = identity(port["UniqueId"])
            require(reference(port["AnchorUniqueId"]) in anchors, "DANGLING_ANCHOR_GUID")
            require(port["Name"] not in names, "DUPLICATE_PORT_NAME")
            names.add(port["Name"])
            require(type(port["PortType"]) is int and port["PortType"] in (0, 1) and type(port["DataType"]) is int and port["DataType"] in (0, 3), "INVALID_NATIVE_PORT_TYPE")
            match = re.fullmatch(r"(Input|Output)([0-9]+)", port["Name"])
            require(match is not None and port["PortType"] == (0 if match[1] == "Input" else 1), "WRONG_PORT_DIRECTION")
            if interface is not None:
                types = interface[match[1] + "DataTypes"]
                require(int(match[2]) < len(types) and types[int(match[2])] == port["DataType"], "FB_PORT_TYPE_MISMATCH")
            ports[port_id] = port
            if wrapper["Discriminator"] == 18:
                require(port["DataType"] == 0, "OR_BOOL_REQUIRED")
                if port["PortType"] == 0:
                    or_inputs.append(port_id)
        if interface is not None:
            require(names == {prefix + str(i) for prefix in ("Input", "Output") for i in range(len(interface[prefix + "Names"]))}, "INCOMPLETE_FB_PORTS")
        if wrapper["Discriminator"] == 18:
            require(names == {"Input0", "Input1", "Output2"}, "INCOMPLETE_OR_PORTS")
    drivers = set()
    for wrapper in document["ConnectorModels"]:
        require(isinstance(wrapper, dict) and set(wrapper) == {"Discriminator", "ConnectorModel"} and wrapper["Discriminator"] == 1, "UNKNOWN_CONNECTOR_WRAPPER")
        connector = wrapper["ConnectorModel"]
        require(set(connector) == {"Color", "FromPortUId", "Points", "ToPortUId", "UniqueId", "ZOrder"}, "UNKNOWN_CONNECTOR_FIELDS")
        identity(connector["UniqueId"])
        source, target = reference(connector["FromPortUId"]), reference(connector["ToPortUId"])
        require(source in ports and target in ports, "DANGLING_PORT_GUID")
        require(ports[source]["PortType"] == 1 and ports[target]["PortType"] == 0, "WRONG_PORT_DIRECTION")
        require(ports[source]["DataType"] == ports[target]["DataType"], "CONNECTOR_TYPE_MISMATCH")
        require(target not in drivers, "MULTIPLE_PORT_DRIVERS")
        drivers.add(target)
    require(all(port in drivers for port in or_inputs), "MISSING_OR_INPUT")
    return {"elements": len(document["Elements"]), "connectors": len(document["ConnectorModels"]),
            "ports": len(ports), "unresolvedSTInstances": unresolved_instances}


def verify_raw_zip_member_names(raw, archive, infos):
    """Validate local and central member-name bytes before zipfile normalizes \\ on Windows.

    This does not extract anything. In particular, ZIPInfo.filename is insufficient
    on Windows because stdlib normalizes a raw backslash into a forward slash.
    """
    pos = archive.start_dir
    for info in infos:
        require(isinstance(pos, int) and pos >= 0 and pos + 46 <= len(raw), "INVALID_ZIP_DIRECTORY")
        require(raw[pos:pos + 4] == b"PK\x01\x02", "INVALID_ZIP_DIRECTORY")
        name_len, extra_len, comment_len = struct.unpack_from("<HHH", raw, pos + 28)
        end = pos + 46 + name_len + extra_len + comment_len
        require(name_len > 0 and end <= len(raw), "INVALID_ZIP_DIRECTORY")
        name = raw[pos + 46:pos + 46 + name_len]
        # Validate original bytes, not platform-normalized ZIPInfo.filename.
        require(b"\\" not in name and b"\x00" not in name
                and not name.startswith(b"/") and not re.match(br"^[A-Za-z]:", name)
                and all(p not in (b"", b".", b"..") for p in name.split(b"/")),
                "UNSAFE_ZIP_MEMBER")
        start = info.header_offset
        require(0 <= start and start + 30 <= len(raw)
                and raw[start:start + 4] == b"PK\x03\x04", "INVALID_ZIP_LOCAL_HEADER")
        local_len, local_extra = struct.unpack_from("<HH", raw, start + 26)
        local_end = start + 30 + local_len + local_extra
        require(local_len > 0 and local_end <= len(raw), "INVALID_ZIP_LOCAL_HEADER")
        local_name = raw[start + 30:start + 30 + local_len]
        require(name == local_name, "ZIP_MEMBER_NAME_MISMATCH")
        pos = end


def inspect_archive(path):
    require(Path(path).stat().st_size <= LIMIT, "ZIP_SIZE_LIMIT")
    raw = Path(path).read_bytes()
    require(len(raw) <= LIMIT, "ZIP_SIZE_LIMIT")
    require(raw.startswith(b"PK\x03\x04"), "INVALID_ZIP_HEADER")
    fixture = json.loads((Path(__file__).resolve().parents[1] / "experimental/fixtures/owle-qa012-sanitized-ports-and-connectors.json").read_text())
    documents = []
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        verify_raw_zip_member_names(raw, archive, infos)
        require(0 < len(infos) <= 128, "ZIP_MEMBER_LIMIT")
        names = [i.filename for i in infos]
        require(len(names) == len(set(n.casefold() for n in names)), "DUPLICATE_ZIP_MEMBER")
        require(MEMBERS.issubset(names), "MISSING_KNOWN_ZIP_MEMBERS")
        require(sum(i.file_size for i in infos) <= LIMIT, "ZIP_EXPANSION_LIMIT")
        for i in infos:
            require(not i.is_dir() and not i.flag_bits & 1, "UNSUPPORTED_ZIP_FLAGS")
            require(i.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "UNSUPPORTED_ZIP_COMPRESSION")
            require("\\" not in i.filename and not i.filename.startswith("/") and all(p not in ("", ".", "..") for p in i.filename.split("/")), "UNSAFE_ZIP_MEMBER")
            require(not stat.S_ISLNK(i.external_attr >> 16), "ZIP_SYMLINK")
            require(i.file_size <= max(i.compress_size, 1) * 200, "ZIP_COMPRESSION_RATIO")
            payload = archive.read(i)  # CRC checked for every member, including unknowns.
            if i.filename in MEMBERS:
                try:
                    value = json.loads(payload, object_pairs_hook=object_pairs,
                                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError("INVALID_JSON_NUMBER")))
                except (UnicodeError, json.JSONDecodeError) as exc:
                    raise ValueError("INVALID_MEMBER_JSON") from exc
                discover(value, documents)
        summary = []
        for document in documents:
            summary.append(inspect_document(document, fixture))
        return {"schema": "airlock-owle-envelope-inspection/1", "status": "ZIP_JSON_ENVELOPE_INSPECTED_ONLY",
                "archiveSha256": hashlib.sha256(raw).hexdigest(), "archiveBytes": len(raw),
                "knownMembers": sorted(MEMBERS), "otherMemberCount": len(infos) - len(MEMBERS),
                "documentSummaries": summary, "nativeDocument": None, "usableForSerialization": False,
                "nativeGui": "NEEDS_NATIVE_GUI", "physical": "PHYSICAL_NOT_TESTED",
                "missing": ["CONFIRMED_ARCHIVE_LAYOUT", "COMPLETE_NATIVE_WRAPPERS_AND_REFERENCES", "NEW_HOME_PC_GUI_QA"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    args = parser.parse_args()
    try:
        print(json.dumps(inspect_archive(args.archive), indent=2))
    except (ValueError, OSError, zipfile.BadZipFile, NotImplementedError, RecursionError, KeyError, TypeError, AttributeError):
        # Avoid leaking member names, paths, source code or project metadata in errors.
        print(json.dumps({"status": "ARCHIVE_REJECTED", "nativeGui": "NEEDS_NATIVE_GUI"}))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
