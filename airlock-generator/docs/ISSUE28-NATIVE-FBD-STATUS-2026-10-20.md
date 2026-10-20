# Issue #28: native FBD generator, TEST_ONLY_NOT_FOR_PLC

20 October 2026. Branch `codex/airlock-28-native-fbd-generator`, based on
`codex/airlock-multidoor-adjacent-qa`. Related: Issue #28 and Draft PR #25.
**Acceptance remains NATIVE_GUI_NOT_VERIFIED / NEEDS_OWEN_VALIDATION.**
This change is a test implementation, not a completed field or native acceptance.

## Implemented code

- `native-airlock-fbd.js`: stateful primitive graph for two doors and the seven
  confirmed physical doors/six groups. AND/OR/NOT, reset-dominant RS, rising edge,
  native-style TON; no ST. The reference evaluator executes this generated graph.
- `experimental/native-reserved-owle.py`: actual ZIP `Project` serializer from
  GUI-saved Owen wrappers. It emits native graphical elements and native connector
  records, not a renamed JSON manifest. Only the captured PR100ED1 device envelope
  is supported. Wider AND/OR functions become chains of real two-input gates.
- `scripts/export-reserved-fbd.js`: deterministic CLI exporting OWLE for two doors,
  plan, I/O CSV, hardware estimate and qualification report. Seven-door export
  returns exit **2** with `CANNOT_FIT_PR100_CAPTURE`; its plan and budget remain
  available. It never fabricates I9/I10 or PRM metadata.
- I/O sizing now counts one sampled request DI per door in the lock-gate design,
  including isolated K1 authorization feedback for the CNC door. BUSY remains zero.

The existing browser timer preview and legacy ST tools remain separate. This new
CLI does not use them as the runtime or as hidden blocks inside the OWLE.

## Reproduce

From `airlock-generator/` with Node >=22 and Python 3:

```sh
node scripts/export-reserved-fbd.js two ../work/two-new
node scripts/export-reserved-fbd.js seven ../work/seven-new
bash scripts/codex-check.sh
```

ZIP timestamps, creator platform and file attributes are pinned so Windows and
Linux exports retain the same bytes. Windows CI also runs serialization and CLI
regression; those jobs do not have Owen Logic GUI.

Both destination directories must be new. `PYTHON` optionally chooses the Python
executable. `seven` deliberately reports a native-export blocker and exits 2;
no `.owle` exists in that directory. Output file names containing `UNVERIFIED`
and the qualification flags must be retained until acceptance is completed.

## Actual vendor evidence

Original, unchanged 10-second timer proof:
`experimental/native-gui/Airlock_NATIVE_2DOOR_INTERLOCK_10S_GUI_20261020.owle`,
SHA256 `040de07825dee60d0ae726073e9c2fc2a0931f27e4ae170b1e4d714eaea8b0ef`.

New GUI capture: `experimental/native-gui/Issue28_PR100_PRIMITIVES_GUI_CAPTURE.owle`,
SHA256 `13b67febaee0dbf0f1ea8396ea90d5ad912c9825b40fc7a48e29d5e90ba66884`.
On HOME-PC, a new copy was opened in a separate Owen Logic process. OR, NOT, RS
and RTRIG were dragged from the vendor library and saved with the GUI. The original
proof was never overwritten. Captured structure:

| Primitive | Vendor discriminator | Verified port names |
| --- | ---: | --- |
| AND / OR | 18 | Input0, Input1, Output2 |
| NOT | 18 | Input0, Output1 |
| TON | 12 | Input0, Output0; TimeScale=0, seconds |
| RS | 15 | **Input0=R**, **Input1=S**, Output0=Q |
| RTRIG | 13 | Input0=I, Output0=Q |

RS port meaning was read from the actual saved drawing labels R/S/Q. It is not
inferred from usual IEC pin order. Templates are hash-pinned. New instance IDs,
ports, anchors, variables and document IDs are remapped together; all wire ends,
port ownership anchors and geometry are checked before writing.

Delivered candidate:
`experimental/issue28/Airlock_2DOOR_FBD_TEST_ONLY_UNVERIFIED.owle`,
SHA256 `a1ee3c06a22795fb5be23d582e3d745e136a591d2fdddf96527429e00b375737`.
134 native elements, 194 native wires, 1 TON 10s, 2 TON 5s, 2 TON 30s.
F1/F2 have distinct positions; a native-view-discovered overlap with Q1/Q2 in
revision 1 was corrected and covered by regression. This is **not** a working-file
claim: native scan ordering and application acceptance are still open.

The delivered revision was also saved via **File → Save Project As** in Owen Logic.
`experimental/issue28/Airlock_2DOOR_GUI_ROUNDTRIP_UNVERIFIED.owle`, SHA256
`fb281472d40eae84da2dee8a1896cd29de5ee6f4e7ae5e2a1da62d2a1fc7c999`.
All 134 element identities, port identities, 194 wire endpoint pairs and timer
presets survived the actual vendor save. GUI-regenerated physical I/O wrappers
lose their comments; regression identifies those channels by vendor title.
This roundtrip contains ordinary connector discriminator 1 only; it supplies
no delay-line schema or proof of native scan ordering. Native Save As passed;
standalone compiler and complete simulator acceptance remain unverified.

## Algorithm and explicit test choices

A fresh request is a rising edge after a low level has actually been observed.
Requests present at startup, held through a deny interval, or denied by another
reservation are consumed, not queued. Before either reed moves, the accepted
request reserves every incident room group. Requests arriving in one scan use
`priority` order. Two-door priority is A, then B. Seven-door order is:

1. D_CNC_1257
2. D_1257_1256
3. D_1256_1254
4. D_1254_1252
5. D_1257_1255
6. D_1255_1253
7. D_1253_1252

Disjoint groups may accept concurrent requests. A rejected higher-priority request
does not propagate a reservation through closed doors. A shared physical door
has one reed, one request and one normal permission output; its incident-group
requirements are combined. Group 1257 contains three doors; 1252 joins both paths.
1274 is excluded.

The test normal permission is `request AND reserved AND closed AND NOT opened
AND NOT expired AND normal AND all incident doors closed`. It drops on opening,
on request release before opening, or after the unused-authorization window.
The reservation survives observed opening and releases on closure. Each incident
group then needs a full, uninterrupted 10 seconds with every door closed. Opening
again resets the complete interval. An unused reservation expires or cancels
without pretending an open/close cycle occurred.

**5 seconds is a test parameter**, not an approved site setting. `build` accepts
`grantMs`; the current native serializer accepts exactly the captured seconds unit
and 5/10/30s presets. A different site parameter needs native regression.

Every door has an independent 30s open-overtime TON. Overtime clears on closure.
Two open doors in a common group latch a separate fault. FireNormal=false or
DATA_HEALTHY=false also inhibit normal access and latch recovery inhibition.
Recovery needs a fresh Reset edge, all doors closed and all requests released;
then a new complete 10s hold. This is the proposed **test** recovery policy, not
approval of a real emergency relocking procedure. No early dirty-side exit
exception is enabled. A stuck-closed reed cannot be detected using one reed alone.

## Simulator I/O and terminals

These are PR100 **simulator channel names**, not electrical terminal numbers.
They do not authorize download to a controller. Actual terminals, NC/NO polarity,
lock-power circuits and emergency release wiring remain **UNASSIGNED**.

| Test channel | Logical signal | Meaning |
| --- | --- | --- |
| I1 | CLOSED_A | 1 = A confirmed closed |
| I2 | CLOSED_B | 1 = B confirmed closed |
| I3 | REQUEST_A | Virtual normal request A |
| I4 | REQUEST_B | Virtual normal request B |
| I5 | FIRE_NORMAL | 1 = normal; test only |
| I6 | RESET | Fresh manual recovery edge |
| I7 | DATA_HEALTHY | Virtual quality/watchdog injection |
| I8 | Unused | No wire |
| Q1 | PERMIT_A | Test normal permission A |
| Q2 | PERMIT_B | Test normal permission B |
| Q3 | BUZZER | Overtime or latched fault |
| Q4 | FAULT_LATCH | Extra simulator diagnostic |
| F1/F2 | Unused | Original vendor device elements preserved |

For the two-door native test, I7/Q4 are additional diagnostic test channels. The
minimal real two-door budget is 6 DI/3 DO; diagnostic channels must not be mistaken
for required plant terminals. `io.csv` lists virtual diagnostics separately from
mapped simulator channels and keeps every physical terminal blank.

Seven-door actual requirement without lamps: **16 DI** = 7 reeds + 7 requests
(1 CNC K1 feedback + 6 local buttons) + FireNormal + Reset; **8 DO** = 7 normal
permissions + 1 buzzer. A common separate fault contact adds one DO. Seven optional
red/green pairs add seven DO, using qualified external changeover contacts.
No physical BUSY outputs. DATA_HEALTHY is an internal quality signal for a future
communications adapter, not an automatically assumed extra plant DI.

With 2 DI/2 DO reserve, the current conservative catalog selects
**PR102-24.2416.03.1 + PRM-1.24** (24 ordinary DI, 24 relay DO). PR102 without PRM
fits 16/8 only with zero DI reserve. An Ethernet alternative is
**PR103-24.1610.03.1.0 + PRM-6.24** (22 ordinary DI, 22 relay DO), excluding four
fast inputs. PR100 is rejected for seven doors. At most two PRM are considered,
none on PR100. Catalog source URLs are retained in `hardware.json`. Exact
modification compatibility, supply/interface limits, memory and scan-time limits
still need manufacturer/device validation; this is capacity selection, not a
verified bill of materials or a native PR102 configuration.

If one PR cannot fit a larger site, the existing selector offers an explicitly
unqualified multi-PR RS-485 aggregate estimate. Local per-PR I/O placement,
master/slave roles, native register maps and timeout commissioning remain
mandatory. Existing `network-watchdog.js` covers missing/stale/replayed data in
reference tests; a future native adapter must drive DATA_HEALTHY false on any
such condition. No native RS-485 exchange program has been delivered here.

## Regression and native acceptance

Automated tests execute both directions, 9.0/9.9/10.0s boundaries, full restart on
reopening, all 128 request combinations, every adjacent pair before reed motion,
all seven individual openings, all forced-open pairs, 1257/1252, cancellation,
held/stale requests, idle expiry, restart, overtime, emergency and quality loss.
Serializer regression checks actual generated ZIP contents against the source
netlist including RS R/S polarity, every wire, timer parameters and binary gate
lowering. Negative tests reject missing wires, duplicate UUIDs, wrong timers,
swapped RS pins, ST, overwrites and an unsupported seven-door device envelope.
These tests do **not** prove vendor scan semantics.

The reference scan snapshots RS outputs, evaluates timers/edges once, commits
all reset-dominant RS states together, then evaluates outputs. Owen Logic must
establish equivalent behavior; this contract cannot be assumed from the file
opening or from a green JavaScript test.

Native observations and remaining actions are recorded in
`experimental/issue28/native-gui-observations.json`. The editor detected **10
cyclic connections** in the emitted graph and offered delay-line conversion.
Both revisions opened in the native simulator. Revision 1 ran and I1 was observed changing 0→1; the delivered revision also completed native Save As.
This does not complete standalone compiler acceptance or race/timer acceptance.

Before acceptance, resolve the native scan/delay-line contract, Save As a separate
test copy, run the actual compiler and record zero errors, then test the following
in the built-in simulator (not through a real serial/Modbus connection):

1. I1=I2=I5=I7=1, I3=I4=I6=0; recover latched fault using a fresh I6 pulse;
   observe no permit before a complete 10s hold.
2. Pause, set I3=I4=1, resume: Q1 only; Q2 must stay zero on every scan. Repeat
   with each door first and with near-simultaneous requests.
3. Observe Q1 expiry without opening; held I3 must not retrigger. Release and
   repress to obtain a fresh attempt. Repeat for Q2.
4. Request, open and close A; check 9.0, 9.9 and >10s. Reopen during hold and
   prove the entire interval restarts. Repeat B.
5. Hold either door open >30s, observe Q3. Force both open, close them and prove
   Q4 remains latched until a qualified manual reset.
6. Exercise I5/I7 loss, restoration, held Reset, held requests and simulator
   restart. Normal permission must never act as an emergency-unlock claim.
7. Only after two-door native acceptance: create a GUI-saved PR102+PRM-1
   envelope with all configured input/output modules, preserve it as the next
   template, implement that exact device mapping, and perform all seven/six-zone
   scenarios in Owen Logic.

One precise vendor sample needed for the feedback issue: in an isolated copy,
use Owen Logic's own conversion of highlighted cyclic connections to delay lines
and Save As a new file. That supplies actual delay connector records and allows
native/reference scan behavior to be reconciled. A PR102+PRM-1 GUI-save is also
required to remove the separate seven-door device-envelope blocker.

No PLC program, physical output, S2000-2 settings, production project, serial
port or deployment was modified. Electrical egress, APS polarity, loss of power,
sensor supervision and actuator circuits remain outside this software acceptance.
