# Codex ST handoff: actual Owen Logic native acceptance

Prepared 20 October 2026. HOME-PC is Windows 11 with Codex CLI 0.163.0 (ChatGPT login confirmed), Node 24.21.0, Python 3.14.7.
Worktree: C:\Users\Forest\Documents\AirlockGeneratorBackup\codex-st-acceptance
Working branch: codex/airlock-28-st-native-acceptance
Base: PR #30 commit 1a27bf4 (the previous experimental FBD is still unverified).
Issue: https://github.com/4qsn1k/4qsn1k.github.io/issues/28
Existing implementation: https://github.com/4qsn1k/4qsn1k.github.io/pull/30
Separate physical I/O: https://github.com/4qsn1k/4qsn1k.github.io/pull/29

## Definition of success
Deliver a genuine vendor-saved Owen Logic project containing a working user ST functional block connected via graphical I/O. Actual compiler and native simulator evidence required. Do not call an ST text file, generated JSON, JS simulation, Save As without Compile, or an import-only OWLE a validated running project. Start with two doors. Only after two-door vendor pass move to seven.

## Existing code and immutable captures
- native-airlock-fbd.js: twoDoor(), sevenDoor(candidate), build(), simulator(), scan contract.
- tests/native-airlock-fbd.test.js: 16/16 offline PASS. Includes all 128 seven-door request masks and 2000 seeded scans.
- tests/reserved-fbd-export.test.js: export PASS. Seven-door native OWLE intentionally blocked by CANNOT_FIT_PR100_CAPTURE.
- docs/ISSUE28-NATIVE-FBD-STATUS-2026-10-20.md: full native status, 10 cycles, timing semantics, template hash and test channel mapping.
- experimental/native-gui/Airlock_NATIVE_2DOOR_INTERLOCK_10S_GUI_20261020.owle: GUI-created AND -> TON 10s -> Q1, proven only for ready signal. SHA256 040de07825dee60d0ae726073e9c2fc2a0931f27e4ae170b1e4d714eaea8b0ef.
- experimental/native-gui/Issue28_PR100_PRIMITIVES_GUI_CAPTURE.owle: original GUI capture for primitives. Preserve unchanged.
- experimental/issue28/Airlock_2DOOR_GUI_ROUNDTRIP_UNVERIFIED.owle: opens / Save As, but native execution and cycle handling NOT proven. Preserve unchanged.
- st-generator.js: older ST generator using SYS.TON syntax for different room/purge logic. Can inform syntax, not a replacement for current request arbiter.
- Read-only example folder: C:\Users\Forest\Documents\AirlockGeneratorBackup\owen-tests
Never overwrite originals or infer OWLE vendor schemas.

## Step 0: verify minimal ST project in vendor GUI
Create a new copy/project for target controller. Use Owen Logic GUI to insert a user ST FB with BOOL input and output, one timer of 10 seconds, and observable output. Save As, Compile, open Simulator, record input/output transitions, program version and exact ST syntax, save hash and evidence. Determine proper scan/scheduling/reset semantics of SYS.TON and edge detection. If GUI cannot be controlled from Codex CLI, explicitly say so and produce concise human GUI steps to create a vendor template. Do NOT fabricate a successful compile.

## Step A: two-door FB_Airlock2
Logical inputs: CLOSED_A, CLOSED_B, REQUEST_A, REQUEST_B, FIRE_NORMAL, RESET, internal/virtual DATA_HEALTHY.
Logical outputs: PERMIT_A, PERMIT_B, BUZZER, diagnostic FAULT.
Simulator-only map from PR #30: I1..I7 correspond to above; Q1=PERMIT_A, Q2=PERMIT_B, Q3=BUZZER, Q4=FAULT. These are not physical screw terminal identifiers.

Behavior:
- Power-on requires all closed, clean normal data, observed LOW request levels, full 10-second hold before accepting fresh request edges.
- Grant reservation BEFORE any reed transition. One shared group: mutually exclusive permits, A priority for same-scan requests.
- Denied/stale/startup-held requests are consumed and never queued; new rising edge after observed LOW is required.
- Grant window is 5s TEST SETTING (not site approved). If no door opens or request drops before opening, cancel grant/reservation. Held request never retriggers after expiry.
- On opening, immediately revoke normal PERMIT, retain group reservation until confirmed closure. All closed -> uninterrupted 10s; reopening restarts entire 10s.
- Door continuously open for 30s -> buzzer; two physically open common-group doors -> separate latched fault.
- FireNormal false or DataHealthy false revokes ordinary permits immediately and inhibits recovery. Fresh RESET allowed only with all closed and requests released. After reset require full new 10s.
- Explicit deterministic state machine with one transition per scan; independent test oracle must not assume the old FBD RS snapshot ordering magically matches vendor ST execution.

Deliver source, vendor Save As file, compiler zero-error evidence, simulator run of docs/CODEX-ST-NATIVE-QA-MATRIX.csv before proceeding.

## Step B: 7 doors and six room groups
Physical routes:
CNC -> 1257 -> 1256 -> 1254 -> 1252
CNC -> 1257 -> 1255 -> 1253 -> 1252

Exact physical door IDs:
D_CNC_1257
D_1257_1256
D_1256_1254
D_1254_1252
D_1257_1255
D_1255_1253
D_1253_1252

Six incident room groups R1252 through R1257. 1274 is parts storage and excluded. R1257 has three doors, R1252 receives two branches. One reed, one normal grant and one physical request per door. Common doors participate in both incident groups, not duplicated.
No transitive/cascade blocking through a closed unrelated room. Disjoint groups may grant concurrently. Every group has independent all-closed TON 10s, reset by any opening. Arbitration is deterministic by the physicalDoors ordering in the source fixture.
Build from experimental/fixtures/real-cad-1252-1274-candidate.json, not hardcoded room numbers in the general generator.

## K1 access and channel accounting
CNC entrance uses S2000-2 K1 authorization. Outside PLC electrical normal-access gate: NormalUnlockCNC = K1_authorization AND PLC_permit.
To reserve BEFORE reed change, a separate isolated sampled K1 Request DI is also required. Without this, PR cannot see the CNC request until opening; 15 DI estimate is CAPACITY ONLY and cannot meet early arbitration. Electrical isolation, K1 pulse width/polarity and the interface have not been accepted.
Seven doors with one local button on each of six inner doors, one isolated K1 DI, 7 reeds, FireNormal and Reset: 16 DI. Normal permits 7 DO, traffic light changeovers 7 DO, common buzzer 1 DO = 15 DO. Without lamps = 16 DI / 8 DO. With two buttons on each internal door = 22 DI / 15 DO. BUSY=0.
Current vendor catalog shortlist PR102-24.2416.03.1 + PRM-1.24: abstract capacity 24 DI / 24 relay DO. This is NOT actual terminal mapping. Obtain real GUI-saved PR102+PRM device envelope before a seven-door OWLE. Prefer a single PLC; never infer a safe distributed interlock merely from aggregate I/O.

## Safety boundary and acceptance
Do not touch active PLCs, serial ports, S2000-2, Modbus writes, relay outputs, COM, or electrical wiring without user approval.
Fire and independent evacuation must be separately hardwired and accepted; logical normal permit may never be the only means of escape.
Reference JS tests do not count as Owen Logic acceptance. Need vendor screenshots/logs documenting actual Save As, Compile without error and Simulator scenarios in the matrix. If a step is unavailable, label ST_NATIVE_NOT_VERIFIED with actionable blocker.
No auto push/merge/deploy; leave original PR #30 and separate PR #29 unchanged.

## Tests and known unrelated failure
From airlock-generator:
node tests/native-airlock-fbd.test.js
node tests/reserved-fbd-export.test.js
npm.cmd run test:fbd
npm.cmd run check

Issue #31: on HOME-PC the pre-existing tests/tcp-faults.test.js:54 assumes >=4 consecutive failures after 650 ms; it failed standalone. Report independently, do not silently modify this test in an ST branch.

## Milestone hand-off format
For each stage, write STATUS, exact paths, Git SHA, commands, exit codes, screenshot/compile/simulator observations, outstanding GUI captures/electrical decisions.
Milestone 0 -> native ST syntax prototype; A -> 2-door compile/sim; B -> 7-door compile/sim; C -> general generator and technical documentation.
Priority is a **native tested two-door program**, not a large undocumented attempt to solve everything in one step.


## Official vendor GUI procedure — ST functional block evidence
Source: https://docs.owen.ru/product/programmnoe_obespechenie_owen_logic/986
This is Owen Logic 3.3 official manual. It confirms custom ST functional blocks for PR102/PR103 and PR100 only when M02. To obtain a real ST block sample:
1. In an isolated NEW project, choose PR102 model (do not connect the actual device).
2. On toolbar choose "Создать функциональный блок на ST".
3. The editor opens with a template; set FUNCTION_BLOCK name, var_input, var_output, var and code.
4. Return to "Схема" (the block is saved in the project library).
5. In "Библиотека компонентов" choose "Функциональные блоки на ST", drag the FB onto the scheme, and wire simulator inputs/outputs.
6. Save project as a uniquely named .owle; run actual compile and built-in simulator and capture evidence.
7. To obtain a stand-alone FB specimen, focus on the FB editor and use "Файл -> Экспорт в файл" to save a .fbst file. The manual explicitly defines .fbst as an ST FB export, distinct from .fst ST function export.
8. No COM, device search, firmware update or "Записать в прибор" permitted.
Manual lists F7 Stop Simulator, F8 Pause, F10 Step, useful for observing request scan priority. Actual menu labels/version and compile result must be confirmed in installed GUI.

These specimen files are still MISSING; leave native status ST_NATIVE_NOT_VERIFIED until physically captured and checked. Never replace a required .owle with only a .fbst.


## Extra offline ST reference vectors
The preparation branch also contains:
- scripts/export-st-reference-vectors.js
- tests/st-reference-vectors.test.js
- experimental/issue28/ST_REFERENCE_VECTORS_OFFLINE.json

The JSON captures 11 two-door state transitions (initial 9.0/9.9/10.0 second hold; same-scan A/B grants; open/close; second full hold; new B request), six group memberships and all 128 seven-door request combinations. It comes from the EXISTING Issue #28 JS reference evaluator and is reproducible; do not modify it just to make the new ST code pass. It is an expected-behavior oracle, not an independent Owen Logic native simulator trace. Any disagreement must be investigated, not papered over. Run:
node tests/st-reference-vectors.test.js

This test is deliberately separate from old npm check until its runtime and native contract are reviewed.
