# Issue #14 — native format evidence and serialization gate, 19.10.2026

## Native Owen Logic editor geometry/save diff — independently verified, 19.10.2026

**A genuine vendor save/diff pair is now available locally on HOME-PC.** In the third **TEST-clone-only** Owen Logic 3.3.378 instance (PID 7128), native simulator was stopped and the virtual element I1 moved vertically. Only the cloned `Airlock_NATIVE_14_UUID_REMAP_TEST_20261019.owle` was changed and saved by Owen Logic. The before file is an unmodified backup `Airlock_NATIVE_14_UUID_REMAP_BEFORE_GUI_SAVE_20261019.owle`.

- Before SHA256 `35A3E289116C7924B398999AD68183CEA90927FFA59131A031DB49DD77BEB7A8`; after native **editor** Save SHA256 `36573D019A813C0595645A4C7318170C2B15734CE611BBD16BDB5D39C436A160`.
- Every **25 element IDs, 64 port IDs and 16 connector IDs remains identical** across the save. Both ZIP members remain `Project` and `StFunctionBlocks`; all 3 ST definitions are JSON-semantically unchanged. Zero dangling connector or FB-definition references.
- Native I1 `ElementModel.Location` changed from `{IsEmpty:true,X:0,Y:0}` to `{IsEmpty:false,X:0,Y:2.5}` (vendor canvas units). The I1 primitive path/text/output-line geometry shifts vertically by 2.5 units.
- Owen Logic automatically rerouted exactly two connector geometries: `I1.Output0 -> FB_Room_N4.Input0` and `I1.Output0 -> FB_Room_N1.Input0`. The latter route was simplified from **3 points to 2**. Other connector `ZOrder` values and element array order may be normalized by the editor; they are not semantic connection changes.
- Published a **strictly whitelisted semantic geometry-diff fixture**, not any raw OWLE or ST: `experimental/fixtures/owle-qa012-editor-geometry-delta.json`, checked by `tests/native-owle-geometry-diff.test.js`. Source UUIDs, entire native archive and program text never leave HOME-PC. Local screenshot `QA018-clone-geometry-drag-preview.png`.
- This confirms native editor open/run/simulate/save of an **existing UUID-remapped TEST diagram** and provides an authentic geometry transformation. It does **not** prove the ability to construct an arbitrary OWLE from `fbd-generator.js`. **`ARBITRARY_NATIVE_WRITER=NOT_IMPLEMENTED`**, **`NATIVE_GRAPH_COMPILATION=NOT_TESTED`**, **`PHYSICAL_PLC_NOT_ACCESSED`**.

Next engineering task: codify these verified element/port/connector coordinate transformations, obtain safe test-only ST/interface metadata and remaining wrappers from the real GUI, and compile a *newly assembled small FBD graph* rather than cloning an existing document. Preserve explicit failure on unsupported data code 4 and unknown native fields.

## Verified independent HOME-PC checkpoints — 19.10.2026 (continuation)

- **Real TEST archive strict mode:** still rejects numeric native port type code **4** as unsupported. Its meaning is not inferred.
- **New optional read-only diagnostic mode** (`python scripts/inspect-native-owle.py FILE.owle --diagnostic`) ran on the actual preserved HOME-PC archive, SHA256 `0E3F85BFC198AA298EBAC5068E76B5C0408CB4590FAEE9530E74559A1A167A00`. Exit 0, `NATIVE_TYPE_UNSUPPORTED_DIAGNOSTIC_ONLY`, `strictValidation=INVALID_NATIVE_PORT_TYPE`, census `0/0:23; 1/0:35; 1/3:2; 1/4:4`. **`usableForSerialization=false`** and `nativeDocument=null`. Safety tests 7/7 PASS on Z4559. Complete `npm run check` on Z4559 PASS; Linux and Windows GitHub Actions for this HEAD PASS.
- **Separate TEST clone created on HOME-PC**, `Airlock_NATIVE_14_UUID_REMAP_TEST_20261019.owle`, SHA256 `35A3E289116C7924B398999AD68183CEA90927FFA59131A031DB49DD77BEB7A8`. A local test helper replaced **187 UUIDs** throughout the existing TEST archive and verified 25 element / 16 connector / 3 ST-definition cross references before attempting any GUI operation. This is a **UUID-remapped copy of an existing saved FBD**, not a graph-to-OWLE generator.
- **Editor GUI opening confirmed** on HOME-PC: Owen Logic 3.3.378 third separate PID 7128 shows the clone filename and displays original FBD symbols, ports and wiring without an opening error. The two older Owen test windows (PIDs 7084 and 9988) were not altered; the clone hash remained unchanged.
- **Native simulator actually entered and executed this UUID-remapped TEST clone**, in separate Owen Logic process PID 7128 on HOME-PC using `Shift+F5` then simulator `Пуск (F6)`. The GUI displayed runtime values; before input action, virtual I1=`0`, `FB_Room_N1.O_State=99`. Clicking *only* virtual I1 set it to `1` and native runtime updated `FB_Room_N1.O_State=90`, `O_Fault=1`, `O_Fire=0` (same fault behavior as the original QA012 test under missing closed reeds). **This is a real GUI simulation of the copied existing diagram**, not a general graph-to-OWLE compiler test. GUI screenshots saved locally: `QA018-third-desktop.png`, `QA018-third-simulator-view.png`, `QA018-third-runtime.png`, `QA018-after-I1-toggle.png`. Do not claim generalized `NATIVE_COMPILE_PASS`.
- **Simulator stopped, editor returned to design mode**, `Ctrl+S` sent to only the cloned test window. The cloned file SHA256 remained `35A3E289116C7924B398999AD68183CEA90927FFA59131A031DB49DD77BEB7A8` after save (no persisted edit, hence no GUI save/diff pair). An additional backup of that test copy is kept locally as `Airlock_NATIVE_14_UUID_REMAP_BEFORE_GUI_SAVE_20261019.owle`. Original source test archive unchanged. Both old Owen windows PIDs 7084 and 9988 remain intact; no PLC or COM actions.

**Remaining gate:** full verified writer metadata, complete native element templates (including unknown data type 4 and original module metadata), general graph materialization, and compiler/simulation of a *newly assembled arbitrary graph* (not just a UUID-remapped copy). Maintain Issue #14 open after merging tooling; do not grant status `NATIVE_GUI_PASS` for arbitrary exported files.


## Independent HOME-PC evidence update — 19.10.2026

The actual GUI-saved `Airlock_FBD_QA012_HOME.owle` was inspected **read-only** on HOME-PC. Its SHA256 remains `0E3F85BFC198AA298EBAC5068E76B5C0408CB4590FAEE9530E74559A1A167A00` (no edits). ZIP contains only two members, `Project` (264553 bytes decompressed) and `StFunctionBlocks` (26717 bytes decompressed). There are 25 native elements, 16 connectors, 6 virtual variable records, and 3 ST definitions (one generic and two test room FBs).

A second, much richer, **redacted derivative fixture** is now checked into this PR: `experimental/fixtures/owle-qa012-sanitized-rich-identity-metadata.json`. It contains all 16 connector geometry objects, the complete five confirmed DI/DO/OR/FB wrapper *structures and numeric fields*, virtual variable structures and ST interface-index arrays (but **no source code**). All 131 observed GUID references are replaced by consistent synthetic `GUID_ALIAS_NNNN` labels, including ST-definition and FB-instance IDs, port/anchor references and two different rooms' version references. Native element port-owner IDs are the original **zero/sentinel identity**, represented by `ZERO_UUID`, rather than guessed per-element owners. Test evidence confirms 44 ports have anchors in their owning wrapper's primitive list.

**Proven matching relations:** `ROOM_A.FunctionBlockUId` and `ROOM_B.FunctionBlockUId` each match one of the three stored ST definition ID aliases; their `LastModificationId` references also match the respective stored version. Five critical links (I4 fanout, two OR inputs, Q4 observer) all resolve to the actual port aliases. Full raw project root UUIDs, ST source, `ModelSerializedData` raw strings, company/site text and raw project settings values are deliberately withheld, so this evidence **cannot** be used as a writer template.

**Independent limitation observed:** Running this PR's original strict archive inspector on the actual GUI-saved TEST archive returned `ARCHIVE_REJECTED`, diagnostic `INVALID_NATIVE_PORT_TYPE`. Numeric port direction/type census over all elements: `(0,0)×23`, `(1,0)×35`, `(1,3)×2`, `(1,4)×4`. Type code **4** occurs on four virtual-input output ports; its native semantic meaning is currently unverified. Fix the read-only inspector to surface recognized-but-not-yet-supported type 4 safely, without interpreting it as BOOL or allowing it in the serializer. This does **not** invalidate its synthetic negative tests.

**Remaining hard gate:** source ST definitions, raw native serialization blobs, all 20 additional wrappers, actual saved project metadata values, GUI save/diff pair, real quality/GREEN/remote native element templates, and native GUI compile/sim of a new generated file. The richer fixture only narrows the information gap; it is **not a serializable OWLE**.


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
- Full log SHA256: `40884ad3043d09543745138696b3e6cf5322d4a0c5c4626b72529a3caf5f0863`. Runtime Node 24.19.0 / Python 3.12.14; CI targets Node 22 / Python 3.13.
- PR #13 base commit `ac5fa80` [CI 39195791301](https://github.com/4qsn1k/4qsn1k.github.io/actions/runs/39195791301): all three jobs success, including memory-adapter RTU tests on Linux/Windows. This does not validate HOME-PC or physical equipment.

Draft [PR #18](https://github.com/4qsn1k/4qsn1k.github.io/pull/18) targets PR #13.
[CI 39196526066](https://github.com/4qsn1k/4qsn1k.github.io/actions/runs/39196526066) on implementation `89c5a35`: all three jobs success. A final follow-up corrects the graph's outdated no-OR-evidence wording and tests JSON object key-order independence; the complete local check passed again with the log hash above.
