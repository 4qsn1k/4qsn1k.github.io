# Issue #14 — native format evidence and serialization gate, 19.10.2026

This branch builds on synchronized PR #13 (`ac5fa80`, main `986ec98`, including
PR #16 and #17). It reuses `fbd-generator.js` and its typed port map. It adds no
room state machine, controller transport, live I/O mapping or equipment access.

**Current result:** `NATIVE_STRUCTURE_FIXTURE_PASS` for published structural
metadata. **Serialization:** `SERIALIZATION_BLOCKED_INCOMPLETE_NATIVE_FIXTURE`.
`nativeDocument: null`, `usableForSerialization: false`, `NEEDS_NATIVE_GUI`,
`PHYSICAL_NOT_TESTED`. No new `.owle` has been generated or opened on HOME-PC.
The Issue remains open. This is a test-ready, partial implementation of Issue #14.

## What is verified

The source is [PR #17's authentic sanitized specimen](OWLE-SANITIZED-NATIVE-EVIDENCE.md),
`experimental/fixtures/owle-qa012-sanitized-ports-and-connectors.json`, derived
from the separate HOME-PC TEST archive SHA256
`0e3f85bfc198aa298ebac5068e76b5c0408cb4590faee9530e74559a1a167a00`.
It describes five of 25 elements in detail, with 16 semantic edges. The remaining
20 elements have opaque synthetic labels, not complete reusable templates.

`experimental/native-owle-schema.js` validates the specimen against its versioned
contract and combines its numeric types/port shapes with the earlier GUI-saved
ST instance interfaces from `fbd-two-native-blocks.sample.json`. FBD BOOL is 0,
FBD UDINT is 3; the legacy ST archive's BOOL=6 is a different namespace.
Unknown wrappers/primitive shapes, type changes, duplicate ports, unknown
endpoints and missing critical links are rejected.

`mapPlan` validates the existing typed plan, then reports port-shape matches:
BOOL INPUT/OUTPUT, matching ROOM_FB interfaces, and exactly two-input OR. All
other nodes and edges are explicitly listed as blocked. No unsupported node is
removed, no quality or GREEN condition is bypassed, and no cross-controller edge
becomes a native wire. A mapping means compatible **port shape**, not a usable
native element. I/O indexes, wrapper defaults, physical terminals and execution
orders are not assigned by this adapter.

The separate `airlock-native-reference-graph/1` is a tool-owned reference index,
not Owen JSON. It contains only the five observed critical connections, with
fresh UUIDs for its elements, ports, connectors and abstract ST definitions.
`FromPortUId` / `ToPortUId` refer to port IDs, never element/primitive IDs. UUID
comparison is case insensitive; remapping preserves every reference and shared
input fanout. Unresolved/wrong ST roles, duplicate GUIDs, BOOL/UDINT mismatch,
multiple drivers, missing OR inputs and altered critical connections are rejected.
These abstract definition references do not prove the native definition-to-instance
binding, anchor/owner relations, or modification identifiers. Those remain gaps.

The earlier experimental ST-only archive builder now prints
`NATIVE_DOCUMENT_GENERATED_UNVERIFIED`, the output SHA256 and `NEEDS_NATIVE_GUI`.
Its old unconditional statement that an output had opened successfully was
removed. It is **not** a whole-project/FBD serializer and is not used by this work.

## Reproduce the reports

From `airlock-generator/`, no dependency installation is needed:

```bash
npm run test:native-schema
node scripts/export-native-evidence.js experimental/fixtures/fbd-four-rooms.model.json /tmp/airlock-native-report-NEW
bash scripts/codex-check.sh
```

The CLI creates a new report directory only and refuses an existing directory
or a destination ending in `.owle`. Output:

- `native-mapping-report.json`: deterministic port mapping, complete coverage,
  blocked nodes/edges, plan hash, hashes of both exact source fixture files.
- `shape-inspection.json`: evidence limits and missing native metadata.
- `specimen-reference-graph.json`: newly allocated UUIDs and the five observed
  links; expressly **not** native project JSON.
- `manifest.json`: exact SHA256 for every report, source model hash and status.

Each run gets fresh reference UUIDs; its manifest records those exact bytes.
No `NATIVE_DOCUMENT_GENERATED_UNVERIFIED` project status is issued by this CLI
because it has no native document to report. That status is reserved for an actual
future `.owle` artifact after its writer and format assertions exist.

## Read-only archive inspection

```bash
python -B scripts/inspect-native-owle.py PATH_TO_SEPARATE_TEST_COPY.owle
```

The inspector never extracts or changes files. It limits input/expanded size,
member count and compression ratio; rejects duplicate/case-aliased names, unsafe
paths, symlinks, encryption, unsupported compression, malformed CRC/ZIP/JSON,
duplicate JSON keys and nonfinite JSON numbers. It reads every member to check
CRC, and parses only the previously observed `Project` / `StFunctionBlocks` names.
It discovers literal `DocumentModel` keys rather than inventing a member layout.
Unknown document/element/primitive/port/connector shapes are rejected within
this narrow subset; actual FB anchors and port GUID endpoints are checked.

The output exposes whitelisted counts and archive SHA256 only, not raw UUIDs,
ST source, project names or site metadata. A successful read reports
`ZIP_JSON_ENVELOPE_INSPECTED_ONLY`, never native acceptance. No discovered document
is also possible: that means the member/document layout still needs confirmation.
The native ST definition relation is deliberately counted as unresolved. The
inspector is not a security scanner and does not certify that an archive is safe
to publish. Review the fixture's allowlist separately before committing it.

## Exact additional samples needed before writing an OWLE

Create these from a **fresh, isolated Owen Logic 3.3.378 HOME-PC TEST project**,
using repository-generated public ST, synthetic names and no production settings.
Do not export or alter a working project to get them. Keep originals and autosaves.

1. **Complete minimal TEST container:** a GUI-saved archive with two room FB
   instances, shared virtual BOOL input fanout to both, native two-input OR of
   the independent block requests and a virtual observer. Include every member's
   exact name, compression/ZIP metadata, SHA256 and JSON root/document path.
   Include document version fields, bounds/work rectangle, variable/catalog
   records, virtual input/output indexing and all referenced project metadata.
   The published list of field names alone cannot supply their values.
2. **Complete element/connector wrappers:** the actual DI, DO, OR and both FB
   wrappers, including `ModelSerializedData`, `ValueToTypes`, `UsedBitMask`,
   nested block identifiers, every primitive's numeric discriminator and body,
   `Location`, port/anchor geometry, point types/styles, `Points`, `ZOrder`,
   `OrderExecution`, pin defaults and all variable references. Omit no field
   required to preserve the GUI-saved objects. No placeholder defaults such as
   empty geometry, zero order or guessed variable indexes are acceptable.
3. **One consistent identity graph and public definitions:** alpha-rename UUIDs
   with a reviewed bijection across *all* occurrences, including archive-member
   references if present. Preserve zero/sentinel identities as documented
   sentinels. Record roles/equality relationships for `UniqueId`,
   `AnchorUniqueId`, `ElementOwnerUId`, `FunctionBlockUId`, definition IDs,
   `LastModificationId` and other modification references. Include the complete
   ST definition metadata using generated public ST and its hash, input/output
   variable indexes/types/arrays and timer instances. The existing specimen
   removes the UUID values, so these relationships cannot be recovered from it.
4. **GUI save/diff pair:** preserve the minimal baseline, then `Save As` a new
   TEST copy after moving the OR and rerouting one wire. Record both hashes and
   actual editor/compile results. Include observed execution order (and how it
   is represented), so layout changes can be distinguished from references or
   ordering changes. Do not infer execution semantics solely from ZOrder.
5. **For full Issue #10 graphs, separately:** GUI-saved examples of the actual
   native quality/validity, final GREEN, fan-in counts other than two, and remote
   signal guards. Specify the source of validity and approved behavior before
   implementing a guard. Without these, only an explicitly scoped minimal TEST
   subset could become serializable; the full graph must remain blocked.

Have the operator review a whitelist export for site/device/network values and
proprietary code. Give the sanitized fixture its own SHA256, provenance and
sanitizer/remapping report; do not label its changed hash as the source hash.
A freshly created public minimal test project is preferable to attempting to
remove private content from an existing installation project.

## New-project HOME-PC acceptance procedure — NOT RUN

The above samples are required before a new `.owle` can be written. Once a real
writer is implemented and its assertions pass:

1. Export into a fresh directory; record output `.owle` SHA256, model hash,
   generator commit, fixture hashes and `NATIVE_DOCUMENT_GENERATED_UNVERIFIED`.
   Use a distinct `Airlock_NATIVE_14_TEST_<run>.owle` on HOME-PC. Never overwrite
   source TEST archives, autosaves or active programs.
2. Open this exact file in Owen Logic 3.3.378 on HOME-PC. Record application
   version, screenshot and all load warnings. A visible window is not a compile
   result. Check the two FB instances, all ports, one shared virtual input, both
   OR inputs and the observer wire.
3. Save through the editor into another new TEST copy, record its SHA256 and
   read-only reference inspection; document GUI normalization differences.
4. Invoke the actual compiler/check command, capture its exact diagnostics and
   screenshots. Do not infer a clean compile from a valid ZIP or successful Save.
5. Run native simulator with recorded virtual inputs/outputs and times: both
   room blocks READY => shared request FALSE; opening 1–2 then closing while N1
   purges => shared request TRUE while N4 is ready; opening 3–4 in N4 while N1 is
   ready => shared request TRUE; open shared 1–4 => both instances observe the
   same input; close => N4 ready while N1 completes its full dwell; reopen during
   dwell => the dwell restarts. These test the *new* project; old native A–F
   evidence does not accept this output.
6. In the new simulator only, verify software fire/fault outputs as the generated
   ST specifies. Record observed restoration behavior without approving a new
   recovery policy. If only the minimal OR subset was serialized, do not claim
   full GREEN/quality/remote logic coverage. For full graph coverage execute
   PR #13's generated `native-test-plan.md`, including every validity dependency.
7. Record `NATIVE_GUI_PASS` only after the new file's open, Save, actual compiler
   diagnostics and required native simulation are evidenced. Otherwise retain
   `NEEDS_NATIVE_GUI` with the failing step. `PHYSICAL_NOT_TESTED` persists.

No PLC download, COM opening, physical PR/SCUD/lock/APS action or existing control
program change is part of this procedure.

## Observed offline validation, 19.10.2026

- `npm run test:native-schema`: JS **8/8**, Python **6/6** PASS.
- Full `bash scripts/codex-check.sh`: **exit 0**, final `AIRLOCK_CODEX_FULL_OFFLINE_QA_PASS`; existing FBD generator **9/9**, evaluator **12/12** (256 combinations, 36 graphs), export **4/4**, MODEL **8/8**, all Modbus/fault suites and PR #17 fixture test retained.
- Four-room example port-shape coverage: **35/95 nodes**, **4/197 edges**; remaining **60 nodes / 193 edges** explicitly blocked, with no dropped conditions.
- Full log SHA256: `bf2dfe9b92fe75343539183e94dab5f6a125fd67f12c920bdadb670ba89c1874`. Runtime Node 24.19.0 / Python 3.12.14; CI targets Node 22 / Python 3.13.
- PR #13 base commit `ac5fa80` [CI 39195791301](https://github.com/4qsn1k/4qsn1k.github.io/actions/runs/39195791301): all three jobs success, including memory-adapter RTU tests on Linux/Windows. This does not validate HOME-PC or physical equipment.
