# Airlock Generator — six-zone primitive FBD plan, ten-second holds

Date: 2026-10-20. Basis: operator-confirmed real CAD topology and timing.
**Status: OFFLINE FBD NETLIST + DETERMINISTIC REFERENCE QA PASS.
Not Owen Logic vendor native .owle, not a compiled or deployed project.**

## Confirmed topology

Two paths share room 1257 at the entrance and room 1252 at convergence:

```text
              CNC (only S2000-2 access reader)
                       |
                     1257
                    /    \
                  1256   1255
                   |       |
                  1254   1253
                    \     /
                      1252
```

Rooms 1252–1257 are interlock groups. Physical room 1274 is
**PARTS STORAGE, OUTSIDE the controlled airlock system**.

There are **seven physical door reeds**, and the six internal
physical doors each have two incident room-group consumers.
The CNC–1257 door has one controlled room-group consumer, but
also Bolid reader/BUSY integration **only at that entry**.

## Pure BOOL primitive algorithm — no ST

For each room group `z`, containing at least two physical doors:

```text
AllClosed_z = AND(Closed_d1, Closed_d2, ..., Closed_dn)
TON_10s_z.IN = AllClosed_z AND FireNormal
TON_10s_z.PT = 10 seconds
ZoneNotReady_z = NOT(TON_10s_z.Q)

LocalInhibit_d_z = Closed_d AND ZoneNotReady_z AND FireNormal
GlobalDoorInhibit_d = OR(LocalInhibit_d_z for incident zones)
Green_d = Closed_d AND FireNormal AND
          AND(TON_10s_z.Q for incident zones)
```

There is **no RS latch requirement** for this particular basic
post-close delay: while any reed is open, `AllClosed_z` is false,
`TON_z.IN` is false and the vendor-standard TON must reset;
after ALL doors are closed, it counts a continuous 10 seconds.
A new opening during that interval cancels that count.

The `Closed_d` guard in `LocalInhibit_d_z` is intentional:
an opened physical door gets no *self-inhibit* and can return
to closed. The local inhibit requests for other closed doors
remain active. When the last physical door closes, the group
requests inhibit on ALL its doors until TON.Q becomes true.

Door-to-door interlocking is strictly LOCAL to the door's
incident room groups. A closed-but-blocked physical door is
not a falsely opened reed and cannot cascade a lockout to
other rooms.

**Logical Bolid BUSY** for CNC entry is separate from the
physical door's own inhibit request:

```text
BolidBusy = FireNormal AND NOT(TON_10s_1257.Q)
```

This retains BUSY even when CNC–1257 is physically OPEN and
its `LocalInhibit` is false. The Bolid contact itself is
**not wired or enabled** by this intermediate output.

**FireNormal=0** removes software inhibit and BUSY requests,
and prevents a logical GREEN, but **does NOT certify**
physical lock release. Egress, APS wiring and lock power must
be independently verified and approved. No direct commands
to Q1–Q4 or any real PR outputs are emitted by the generator.

## Actual generated logical plan

Module: `native-timed-fbd-plan.js`.

| Property | Offline generated result |
| --- | --- |
| Room groups | 6 |
| Physical reed inputs | 7, exactly one per door |
| Independent `TON` blocks | 6, each preset 10,000 ms |
| Node count | 85, including virtual I/O endpoints |
| Typed BOOL connections | 148 |
| Primitive logic | AND / NOT / OR / TON |
| User ST blocks | **0** |
| Per-door outputs | 7 logical INHIBIT + 7 logical GREEN |
| Bolid output | Logical BUSY for CNC↔1257 only |
| Actual PLC DO assignments | **0** |
| Valid Owen Logic `.owle` | **Not yet serialized** |
| Native Owen Logic Compile / Simulate | **Not passed** |

Export to a NEW output folder on HOME-PC:

```powershell
cd 'C:\Users\Forest\Documents\AirlockGeneratorBackup\graph-qa\airlock-generator'
node scripts/export-native-timed-fbd-plan.js experimental/fixtures/real-cad-1252-1274-candidate.json C:\Users\Forest\Documents\AirlockGeneratorBackup\owen-tests\new-native-timed-plan
```

This produces `primitive-netlist.json`, `wires.csv`,
`vendor-native-next-steps.md` and `sha256-manifest.json`.
The deterministic exporter refuses overwriting any existing
output folder and refuses any `.owle` destination.

Local first export:
`owen-tests/cad-native-timed-netlist-20261020`.
This **does not** constitute a vendor project file.

## Offline QA

`tests/native-timed-fbd-plan.test.js` executes the **generated
gate/TON graph**, independently of the previous ST/room emulator,
with a virtual 20-ms scan. It checks:

- initial ten-second hold after cold power-up;
- each of seven door-open events affects precisely its two
  incident room groups (one for CNC door) and no others;
- holding the physical door open for 20 seconds never
  releases the group;
- all incident doors remain blocked for 9.4 seconds after
  closure and release only after completing 10 seconds;
- re-opening during the ten-second interval cancels and
  restarts a FULL interval after re-closure;
- CNC door opened: BolidBusy remains TRUE while physical
  self-inhibit stays FALSE;
- a fire input releases only *software* inhibit and inhibits
  GREEN; a return to normal restarts the 10-second timer;
- malformed/duplicate physical doors, missing zone members,
  tampered or unwired gates and a deployable candidate are rejected;
- generation repeated with the same input is byte-for-byte stable.

`tests/native-timed-fbd-export.test.js` validates the exporter,
repeated identical content hashes, manifest checksums, write
fail-closed behavior, no `.owle` masquerading and no program
upload. **16/16 graph tests and 5/5 exporter tests PASS locally**.

These tests do not calibrate an actual PLC timer clock or
prove physical I/O actions.

## Hard blockers before native .owle or actual PR100

1. The authentic Owen Logic TEST `.owle` on HOME-PC has
   physical I/O templates and one native OR block, but **no
   GUI-saved native TON sample**. A previous truncated native
   save attempt produced a stack-overflow crash and is not a
   reliable basis for generating arbitrary FBD nodes.
2. Obtain a vendor-GUI-saved **pure FBD** TEST project with
   BOOL AND, OR, NOT and TON preset to precisely ten seconds,
   plus the manufacturer's native port and time-unit metadata.
   Preserve the original source. No ST definitions in
   the new target (unless explicitly requested later).
3. Build native wrappers/connectors/layout using validated
   vendor samples; map UUID references consistently without
   inventing element metadata. Keep controller pin index
   semantics and actual device type.
4. Perform successful Owen Logic OPEN, SAVE AS, COMPILE,
   SIMULATION on a separate never-deployed file. Negative
   tests must include simultaneous opens, failed reed/APS,
   network timeout, loss of controller power, egress and
   Bolid BUSY contact polarity.
5. Only after independent electrical/safety approval may
   any generated application be considered for PR100
   loading. The PLC is not touched in this work.

**The 10-second *access interlock hold* is distinct from any
ventilation purge time, filtered-room pressure verification or
the open-door overtime buzzer.** None of those subsystem
requirements is inferred from this block delay.

## Working self-contained visual FBD simulator (for inspection first)

The static HTML demo at
`demos/cad-1257-fbd-simulator.html` is a **working interactive
browser simulator**, generated by
`scripts/render-timed-fbd-viewer.js`.
It has no external script/network dependency and contains the
same `native-timed-fbd-plan.js` JS gate/TON evaluator as the
offline tests. It does not contact Owen Logic, COM5, Modbus, PLCs,
access controllers or actual lock/relay hardware.

Open the HTML file in any desktop browser (double-click). It shows:

- two operator-confirmed paths, 1257–1256–1254–1252 and
  1257–1255–1253–1252, from CNC with Bolid only at the entrance;
- buttons to change each of **seven reed inputs**; separate
  normal/fire input for logic-only APS testing;
- virtual clock step buttons for 0.1 / 1 / 5 / 10 seconds, plus reset;
- real-time status cards for all **six 10-second TON groups**;
- selected-room FBD chain AND(AllClosed) → AND(FireNormal) →
  TON(10s) → NOT(ready) → AND(logical BUSY);
- live 0/1 values for the **85 generated logic and I/O nodes**,
  with selectable individual-room and full-graph views;
- logical per-door BLOCK, GREEN and CNC S2000-2 BUSY;
- hardware sizing controls for number of doors, lamp DOs, extra
  DI (exit pushbuttons, additional inputs), DI/DO reserves and
  required Ethernet vs RS-485.

The browser page **does not simulate electrical drive**; the
logical inhibit and BolidBusy signals have no real PLC terminal.
Lock NC/NO states, SCUD interlocks, fire egress and ventilation
require separate design and field trials.

`tests/fbd-interactive-viewer.test.js` verifies UI code execution
using a browser-like isolated JavaScript context and operator-like
button events. This supplements the gate tests, not actual Owen
Logic Save/Compile/Simulation.

## Automatic equipment capacity selection

New `hardware-auto-selector.js` offers an advisory configuration
for **any specified number of doors**, plus arbitrary reserve and
extra-input settings. It evaluates one real catalog-specific
head PLC with zero, one or two catalogued PRM units. It rejects
insufficient channel counts and can propose **multi-PLC aggregate
capacity** if all single-PLC configurations fail.

Supported 24-V relay-based variants (do NOT mix with ~230V input
versions; all values refer to the *exact* device suffix):

| Device | Ordinary DI | Fast DI, excluded from this calculation | Relay DO | Expansion slots | Communications |
| --- | ---: | ---: | ---: | ---: | --- |
| PR100-24.1208.03.1 | 8 | 0 | 8 | 0 | one RS-485 |
| PR102-24.2416.03.1 | 16 | 0 | 16 | 2 | one RS-485 |
| PR102-24.2416.03.2 | 16 | 0 | 16 | 2 | two RS-485 |
| PR103-24.1610.03.1.0 | 6 | 4 | 10 | 2 | one RS-485 + Ethernet |
| PR103-24.1610.03.2.0 | 6 | 4 | 10 | 2 | two RS-485 + Ethernet |
| PRM-1.24 | +8 | 0 | +8 | n/a | **internal PRM bus** |
| PRM-5.24 | 0 | 0 | +16 | n/a | **internal PRM bus** |
| PRM-6.24 | +16 | 0 | +12 | n/a | **internal PRM bus** |

Source manuals/catalog:
- PR100: https://docs.owen.ru/product/pr100/78/117414
- PR102: https://agriculture.owen.ru/product/pr102/modifications
- PR103: https://docs.owen.ru/product/pr103/897/101853
- PRM-1: https://owen.ru/product/prm1/specifications
- PRM-5: https://owen.ru/product/prm5
- PRM-6: https://owen.ru/product/prm6/specifications

**Physical PRM module connections use the special internal
expansion bus, not RS-485 Modbus RTU.** RS-485 must be planned
separately for communication between several controller heads.
For multiple head PLCs, aggregate capacity is merely an early
filter; actual door outputs must be assigned to a controller,
shared reed states published across RS-485, watchdog and timeout
defined, and physical emergency access independently protected.

### Example with the confirmed seven doors

Base inventory under current conservative assumptions:

| Channel demand | Count |
| --- | ---: |
| Individual physical reeds | 7 DI |
| APS normal + reset/fault acknowledgement | 2 DI |
| **Total DI** | **9** |
| One logical relay request per lock | 7 DO |
| One changeover red/green signal per door | 7 DO |
| One common buzzer | 1 DO |
| One S2000-2 BUSY (CNC entry only) | 1 DO |
| **Total relay DO** | **16** |
| Desired spare channels | 2 DI + 2 DO |

With this assumption set, PР100 is too small. PR102 without
expansion is nominally sufficient for the main loads but
has no DO spare. **Automatic top choice** (catalogue capacity
only): **PR102-24.2416.03.1 + PRM-1.24**, with **24
ordinary DI, 24 relay DO**, leaving **15 DI and 8 DO** before
additional field signals. **Alternative**: PR103-24.1610.03.1.0
+ PRM-1.24, **14 ordinary DI, 18 relay DO**, leaves 5 DI and
2 DO and includes Ethernet. The PR103's four fast inputs are
not counted as ordinary DI, pending compatibility verification.

Adding six exit buttons consumes six more DI and can change
the recommendation automatically. The lamp strategy, separate
buzzers, fault relays, pressure sensors, actual lock wiring,
future controlled doors, extra fire/egress circuits and
site equipment list must be confirmed before purchase.

`tests/hardware-auto-selector.test.js` covers exact catalogue
families, resource arithmetic, PRM inventory, alternative
scenarios, Ethernet, RS-485 port options and the strictly
nondeployable distributed alternative.

**FBD primitive simulation and auto capacity selection pass their
independent offline tests. Neither proves that one Owen PLC has
adequate native program memory, timer resources or scan time.**

## Browser smoke test

In addition to 6/6 isolated UI-interaction tests, **actual Microsoft Edge**
headless rendered `demos/cad-1257-fbd-simulator.html` on HOME-PC with
`--dump-dom` (exit code 0). Its rendered DOM contained the active door,
Bolid BUSY and automatically computed hardware recommendation.
An earlier PowerShell invocation of headless Edge returned code 13 due
to malformed command parsing; this was superseded by successful
Node `spawnSync` with explicit argv. No physical COM5 connection or
new OWLE program was involved. Full `npm run check` completed exit 0.
