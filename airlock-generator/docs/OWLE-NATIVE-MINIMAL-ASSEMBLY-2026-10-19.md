# Issue #14 — first NEW minimal native FBD document (HOME-PC, TEST only)

Date: 2026-10-19. Branch: `codex/airlock-14-minimal-native-assembly`.

## Scope

`experimental/native-minimal-fbd-owle.py` assembles a new small native diagram
from **five unmodified, GUI-saved native wrappers and five authentic connectors**
taken from an existing, SHA256-pinned HOME-PC TEST specimen. This is a
**selective assembly with new identities**, not a clone of all 25 FBD elements.

Selected diagram:
- one virtual BOOL input `I4` driving two room FB input pins;
- two already stored ST instances `FB_Room_N1` and `FB_Room_N4`;
- their independent BOOL inhibit requests into a genuine two-input OR;
- OR output to a virtual `Q4` observer.

Exactly 5 elements, 44 ports, 5 connectors, 3 existing ST definitions. Other
test elements are **removed** from the document. Nonzero GUID references in
both native members are rewritten consistently. The zero GUID sentinel remains.
All native wrapper fields and saved wire geometries are preserved; the project
document and its variable catalog remain from the TEST archive. The script
**does not generate arbitrary nodes, place symbols, generate fresh ST,
renumber virtual variables or assign physical controller I/O**.

## Local HOME-PC export performed

Original input (unchanged):
`owen-tests/Airlock_FBD_QA012_HOME.owle`,
SHA256 `0e3f85bfc198aa298ebac5068e76b5c0408cb4590faee9530e74559a1a167a00`.

Output generated in same local offline test directory:
`Airlock_NATIVE14_MINIMAL_NEW_FBD_20261019.owle`.
SHA256 `f11fb96128ed92b4e9b1cbad063b47037d87b556b3376889f107615e6384c1b3`.

116 nonzero UUIDs were remapped. Both archive members are kept. An adjacent
`.owle.manifest.json` stores checksums and unverified status. Output was
created with exclusive-create semantics; existing targets are refused.

Independent repository inspector returned
`ZIP_JSON_ENVELOPE_INSPECTED_ONLY`, 5 elements, 44 ports, 5 connectors,
2 ST instances, strictValidation=null. This is a **syntactic read-only check**,
not a vendor compatibility, compilation or simulation check.

The unsupported native type code `4` is **not converted** to BOOL:
the analog wrappers carrying it are not selected. The selected 5 elements
must use only verified FBD code 0 (BOOL) and 3 (UDINT). The type 4 meaning
remains unknown.

## Reproduce on HOME-PC only

Run in a test working directory with the genuine pre-existing test source:

```powershell
python -B experimental/native-minimal-fbd-owle.py <original_test_archive.owle> <brand_new_unique_test_name.owle>
python -B scripts/inspect-native-owle.py <brand_new_unique_test_name.owle>
python -B tests/native-owle-minimal-assembly.test.py
```

The CLI refuses unknown source SHA256, overwrite, duplicate/missing wrappers,
unknown native port codes, missing OR links, dangling/reversed/wrong-type
connections, multiple drivers, invalid ST reference relations and source UUID
reuse. No `.owle` or ST program is committed to GitHub. Never use a live or
production source archive.

## Outstanding vendor GUI acceptance

Status: `NATIVE_DOCUMENT_GENERATED_UNVERIFIED` / `NEEDS_NATIVE_GUI`.

1. Open this **specific output**, never the source, in a new Owen Logic 3.3.378
   window. Record exact load warning/errors and a screenshot. Inspect that only
   five nodes and five wires appear, including both OR inputs.
2. Save **as another distinct TEST copy**. Record before/after hashes and a
   new strict read-only structural inspection. Do not replace existing tests.
3. Run the real Owen Logic compiler/check. Record compiler diagnostics.
4. Simulate only this small graph; confirm the shared input fanout and OR
   request. Missing inputs are deliberately unconnected in this constrained
   subset; their safe behavior is not established.
5. To support a full project, build a verified writer for additional actual
   wrappers (all DI/DO and FB interfaces, quality/validity checks, final GREEN,
   remote guards, execution order and placement), then independently accept
   each new generated document through compiler and simulation.

Do not infer full interlock correctness or physical safety from GUI opening.
No COM5, PR100, SCUD, locks, fire alarm, external ventilation or PLC write
is involved. The independent electrical fail-safe/egress review remains open.

## GUI window observation (new FBD file)

A **new, independent Owen Logic process** was launched on HOME-PC for the
generated five-element file. Windows process ID was **3612** at observation time.
`MainWindowTitle` matched the generated file path, `Responding=True`;
read-only UI Automation found the document window and 97 child controls.
The output SHA256 remained unchanged.

This establishes **`NEW_TEST_OWLE_EDITOR_WINDOW_OPEN_OBSERVED`** only.
UI Automation does not expose all FBD symbols as readable text, so a visual
element-by-element review, Save, compiler diagnostics and native simulation
remain **NOT TESTED**. No other Owen Logic test windows were closed or changed.

## Automated validation

HOME-PC: `python -B tests/native-owle-minimal-assembly.test.py` = **10/10 PASS**.
`npm.cmd run check` = **exit 0**, including the existing full independent
model suite (`MODEL_QA_FINAL PASS 8/8`). This QA is offline only and does
not run any real COM or PLC operation.

## Native simulator observation (newly assembled file)

The separate new-file Owen Logic window (PID 3612 at the time) was focused
only after checking its exact full filename and foreground PID. The software
simulator was entered with `Shift+F5`, then run with `F6`. The editor displayed
live 0/1 input and output values, its simulator time advanced, and
`FB_Room_N1` visually showed **O_State=99** and **O_Fault=1** with its
unconnected test inputs at their initial values. This is an actual
**native simulator execution observation for the newly assembled file**,
not proof of the OR truth table or approved safety logic.

Screenshot retained only on HOME-PC:
`owen-tests/Airlock_NATIVE14_MINIMAL_SIM_FIRSTLOOK.png`.
After the simulator started, the new OWLE SHA256 still matched
`f11fb96128ed92b4e9b1cbad063b47037d87b556b3376889f107615e6384c1b3`.
No editor Save/Save As or independent compiler diagnostic has been captured.
`NEW_TEST_NATIVE_SIMULATOR_ENTERED_AND_RUNNING_OBSERVED`;
`NEW_TEST_NATIVE_ACCEPTANCE_PASS=false`.

## Save attempt on separate copy — NOT PASS (19 Oct, follow-up)

The generated 5-node archive was copied into a **separate TEST file**,
`Airlock_NATIVE14_MINIMAL_EDITOR_SAVE_TEST_20261019.owle`, plus an untouched
pre-save backup. Both initially matched the generated SHA256
`f11fb96128ed92b4e9b1cbad063b47037d87b556b3376889f107615e6384c1b3`.

A new Owen Logic process opened that test copy. After verifying the exact
target window/PID, an isolated Ctrl+S was sent. The hash **remained unchanged**.
A later observation found the GUI showing an **empty document area** with
the process title reduced to `Owen Logic`, instead of the test filename.
The program remained responsive. A screenshot is saved only on HOME-PC:
`owen-tests/native14_minimal_editor_copy_before_drag.png` (despite the
screenshot's historical name, it records the empty editor state).
The earlier generated file and its original TEST source remained unchanged.
The exact reason for the editor's empty view has not been established.
Do not infer that Ctrl+S alone caused it or that Owen Logic saved the document.

**Status:** `NEW_TEST_EDITOR_SAVE_PASS=false`,
`NEW_TEST_NATIVE_COMPILER_PASS=false`,
`NEW_TEST_NATIVE_SIMULATOR_ENTRY_OBSERVED=true`,
`NEW_TEST_FULL_ACCEPTANCE_PASS=false`.

Next: isolate the editor lifecycle under a repeatable TEST copy, capture
any vendor diagnostics or confirmation dialogs, and obtain a changed
`Save As` artifact before claiming successful native serialization.
