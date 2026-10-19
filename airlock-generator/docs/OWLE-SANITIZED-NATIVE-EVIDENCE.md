# OWLE native TEST evidence — sanitized structural fixture, 18.10.2026

## Origin and trust boundary

Derived read-only on HOME-PC from a **separate Owen Logic 3.3.378 TEST file**:
`C:\Users\Forest\Documents\AirlockGeneratorBackup\owen-tests\Airlock_FBD_QA012_HOME.owle`.

SHA256 of original TEST archive: `0E3F85BFC198AA298EBAC5068E76B5C0408CB4590FAEE9530E74559A1A167A00`.

**The raw archive is intentionally NOT uploaded.** The published fixture contains only whitelisted element/port shape fields, native numeric discriminators, and 16 reconstructed semantic connector endpoints. All original GUID values, ST source, project/site identifiers, device metadata, raw geometry, serial/project serialization blobs, and internal secrets are excluded. Some field **names** such as `ModelSerializedData`, `KeyFileName` and `UniqueId` are retained as structural keys, but **their values are not**.

File: [`experimental/fixtures/owle-qa012-sanitized-ports-and-connectors.json`](../experimental/fixtures/owle-qa012-sanitized-ports-and-connectors.json).

## Confirmed native structure

The GUI-saved TEST archive contains **25 FBD elements** and **16 connector entries**. Metadata examples include:

| Role (synthetic) | Wrapper Discriminator | Port count |
| --- | ---: | ---: |
| `INPUT_SHARED` (real test DI I4) | 2 | 1 |
| `ROOM_A` (`FB_Room_N1`) | 41 | 18 |
| `ROOM_B` (`FB_Room_N4`) | 41 | 21 |
| `OR_SHARED` (native OR) | 18 | 3 |
| `OUTPUT_OR` (test Q4) | 3 | 1 |

The OR has native port names `Input0, Input1, Output2`, BOOL data code `0` in the FBD model, and port direction codes `0, 0, 1`. Avoid confusing this namespace with ST internal datatype enums.

The five structurally verified native links are:

```text
INPUT_SHARED.Output0 -> ROOM_A.Input3
INPUT_SHARED.Output0 -> ROOM_B.Input2
ROOM_A.Output8      -> OR_SHARED.Input0
ROOM_B.Output7      -> OR_SHARED.Input1
OR_SHARED.Output2   -> OUTPUT_OR.Input0
```

Every original connector uses `ConnectorModel.FromPortUId` and `ToPortUId` referencing **`ElementModel.Ports[].UniqueId`**, not `Primitives[].UniqueId`. Test I/O element wrappers include `InputVariableIndex` / `OutputVariableIndex`. Instance wrappers (`Discriminator: 41`) include nested `ElementBlockStoreModel.ElementModel` and `FunctionalBlocksDirectorStoreModel`.

Only synthetic `ROOM_A`, `ROOM_B`, `INPUT_SHARED`, `OUTPUT_OR`, `OR_SHARED`, `NODE_n` labels are included for connectivity. The `NODE_n` labels carry no identity outside this TEST file.

## What the fixture does NOT prove

- It is a metadata schema specimen, **not** a runnable, complete `.owle` or a native serializer template.
- GUID identities, references to function block definitions, program metadata, execution order, input/output variables, primitive geometry, JSON archive contents and Owen Logic project versioning **are omitted**.
- There is no proof that a newly generated OWLE can be opened, saved, compiled, simulated, or loaded into a PLC.
- Existing N1/N4 native test PASS refers only to the original TEST project, not generated arbitrary FBD graphs.
- Physical PR100, SCUD/locks/APS and ventilation were **not** touched.

## Next task for Codex — Issue #14

1. Consume this sanitized fixture as structural evidence; add strict parser/schema introspection and test-only graph→native mapping for the known subset.
2. Identify **additional safely sanitized data** needed before producing a real OWLE file (e.g., relationships among port anchors, primitive UUIDs, FB definition GUID references, element defaults, execution order, document metadata and geometry). List gaps explicitly.
3. Never make up omitted field values. Request another white-listed TEST fixture from HOME-PC if needed.
4. Reject unknown element discriminators, duplicate or dangling port IDs, type mismatches, and missing OR inputs.
5. Run `bash scripts/codex-check.sh`, report `NATIVE_STRUCTURE_FIXTURE_PASS` only; `NATIVE_GUI_PASS` requires opening/saving/simulation of **new** generated TEST output in Owen Logic.
6. Never change real equipment or its project.

Standalone validation: `node tests/native-owle-sanitized.test.js`. It proves the data shape and five critical links, **not** native compilation.

## 19.10.2026 — Issue #14 consumer

The strict evidence adapter, read-only archive inspector, reference remapping tests
and exact additional-fixture request are documented in
[OWLE-NATIVE-SERIALIZATION-ISSUE-14.md](OWLE-NATIVE-SERIALIZATION-ISSUE-14.md).
Serialization remains blocked; no new native document or HOME-PC PASS is claimed.
