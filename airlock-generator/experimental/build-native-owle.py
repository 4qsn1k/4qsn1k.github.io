#!/usr/bin/env python3
"""Experimental, UNOFFICIAL native .owle archive builder.

This procedure was reverse-engineered from one existing Owen Logic project
saved in October 2026. Owen does not document this JSON schema as an API.
Use only a COPY of an existing project. Do not deploy the result to a PLC.

Usage:
  python experimental/build-native-owle.py original.owle test.owle FB_Room_N1.st FB_Room_N4.st
"""
import copy
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import uuid
import zipfile

TYPES = {"BOOL": 6, "UDINT": 3}
def parse_section(source, section):
    m = re.search(r"\b" + section + r"\b(.*?)\bEND_VAR\b", source, re.I | re.S)
    if not m:
        raise ValueError(f"No {section} in ST code")
    result = []
    for line in m.group(1).splitlines():
        found = re.match(
            r"\s*(\w+)\s*:\s*(BOOL|UDINT|SYS\.TON)\s*(?::=\s*(\w+))?\s*;",
            line, re.I
        )
        if found:
            result.append((found.group(1), found.group(2).upper(), found.group(3)))
    return result

def make_block(source, template):
    header = re.search(r"\bFUNCTION_BLOCK\s+(\w+)", source, re.I)
    if not header:
        raise ValueError("Missing FUNCTION_BLOCK header")
    inp = parse_section(source, "VAR_INPUT")
    out = parse_section(source, "VAR_OUTPUT")
    local = parse_section(source, "VAR")
    fb = [v for v in local if v[1] == "SYS.TON"]
    local = [v for v in local if v[1] != "SYS.TON"]
    variables = inp + local + out
    n_in, n_fb, n_local = len(inp), len(fb), len(local)
    output_start = n_in + n_fb + n_local
    indexes = list(range(n_in)) + list(
        range(n_in+n_fb, n_in+n_fb+n_local+len(out))
    )
    result = copy.deepcopy(template)
    result.update({
        "Id": str(uuid.uuid4()),
        "Name": header.group(1),
        "LastModificationId": str(uuid.uuid4()),
        "ModificationLabel": str(uuid.uuid4()),
        "CreationDateTime": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "SourceCode": "\r\n" + source.replace("\r\n","\n").replace("\n","\r\n"),
        "InputNames": [v[0] for v in inp],
        "InputDataTypes": [TYPES[v[1]] for v in inp],
        "InputVariableIndexes": list(range(n_in)),
        "InputArrayRanges": [{"Start": [], "End": []} for _ in inp],
        "OutputNames": [v[0] for v in out],
        "OutputDataTypes": [TYPES[v[1]] for v in out],
        "OutputVariableIndexes": list(range(output_start, output_start+len(out))),
        "OutputArrayRanges": [{"Start": [], "End": []} for _ in out],
        "VariableNames": [v[0] for v in variables],
        "VariableIndexes": indexes,
        "VariableStorageTypes": [2 for _ in variables],
        "VariableDataTypes": [TYPES[v[1]] for v in variables],
        "DefaultValues": [v[2] for v in variables],
        "ArrayRanges": [{"Start": [], "End": []} for _ in variables],
        "FbInstances": [{"Name": v[0], "TemplateName": "SYS.TON", "VariableDataType": 3} for v in fb],
        "FbInstanceIndexes": list(range(n_in, n_in+n_fb)),
    })
    return result

def main():
    if len(sys.argv) < 4:
        raise SystemExit("Usage: build-native-owle.py input.owle output.owle block1.st [block2.st]")
    src, dst, *blocks = [Path(p).resolve() for p in sys.argv[1:]]
    if src == dst:
        raise SystemExit("Refusing to overwrite original project")
    if dst.exists():
        raise SystemExit("Refusing to overwrite existing output file")
    if any(p == src for p in blocks):
        raise SystemExit("ST input must not be original .owle")
    original_digest = hashlib.sha256(src.read_bytes()).hexdigest()
    with zipfile.ZipFile(src) as old:
        if not {"Project", "StFunctionBlocks"}.issubset(old.namelist()):
            raise ValueError("Unrecognized project archive")
        existing = json.loads(old.read("StFunctionBlocks"))
        if not existing:
            raise ValueError("No existing ST block to use as metadata template")
        merged = copy.deepcopy(existing)
        for source_path in blocks:
            merged.append(make_block(source_path.read_text(encoding="utf-8"), existing[0]))
        with zipfile.ZipFile(dst, "w") as out:
            for member in old.infolist():
                payload = old.read(member.filename)
                if member.filename == "StFunctionBlocks":
                    payload = json.dumps(merged, ensure_ascii=False, indent=2).encode("utf-8")
                out.writestr(member, payload)
    with zipfile.ZipFile(dst) as check:
        if check.testzip() is not None:
            raise ValueError("Output ZIP integrity check failed")
        if len(json.loads(check.read("StFunctionBlocks"))) != len(merged):
            raise ValueError("ST block count check failed")
    assert hashlib.sha256(src.read_bytes()).hexdigest() == original_digest
    print(f"Created {dst} with {len(merged)} total ST blocks.")
    print("NATIVE_DOCUMENT_GENERATED_UNVERIFIED; NEEDS_NATIVE_GUI for this new output.")
    print("SHA256 " + hashlib.sha256(dst.read_bytes()).hexdigest())
    print("ST compile, on-device I/O mapping and safety validation NOT verified.")

if __name__ == "__main__":
    main()
