# Verified vendor-native Owen Logic TON + two reed inputs

Date: 20 October 2026. Host: HOME-PC (Forest). Controller device selected in Owen Logic GUI: PR100 (offline).

## Actual file and provenance

`experimental/native-gui/Airlock_NATIVE_2DOOR_INTERLOCK_10S_GUI_20261020.owle`

SHA256 `040de07825dee60d0ae726073e9c2fc2a0931f27e4ae170b1e4d714eaea8b0ef`.

Created via **File → Save Project As...** in a running
Owen Logic **native FBD graphical editor** after placing the
manufacturer's AND and TON blocks from the component library.
No ST source or custom embedded script.

Physical relay deployment status: **TEST_ONLY_UNSAFE_TO_FLASH**.
The file has one observed test output Q1 as a **ten-second readiness
indicator**, **NOT an electrically qualified lock actuator**.

## Exact vendor FBD logic

```
I1 (door A reed closed = 1) ─┐
                             AND ── TON(10 seconds) ── Q1 (readiness only)
I2 (door B reed closed = 1) ─┘
```

The original file also contains other standard unconnected device
inputs/outputs, automatically created by Owen Logic. It is NOT
a seven-door design and it intentionally DOES NOT yet contain
lock-control relays, S2000-2 reader grants, alarm, FIRE NORMAL
logic, mutually exclusive reservations, or real I/O assignments.

ZIP `Project` contains 16 vendor FBD element wrappers in this PR100
project, one **vendor TON** (Discriminator 12) with
`ImpulseTime=10` and `TimeScale=0`, one native AND
(Discriminator 18), and exactly four actual wire records:

1. `I1.Output0 → AND.Input0`
2. `I2.Output0 → AND.Input1`
3. `AND.Output2 → TON.Input0`
4. `TON.Output0 → Q1.Input0`

`tests/native-gui-two-door-proof.py` validates this **actual**
`.owle` ZIP structure, unique physical IO+block port UUIDs,
all four connections, native timer configuration and absence
of an ST program block. The proof fails if any wire is missing,
duplicate, or rerouted; it does not rewrite the file.

## Editor simulation observations (manual, not CI automation)

Successfully opened and executed this `.owle` in native
Owen Logic Simulator on HOME-PC.

| Door A / I1 | Door B / I2 | Q1 after > 10 seconds |
| --- | --- | --- |
| 0 | 0 | 0 |
| 1 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 1 | 1 |

With both inputs at 1, shortly after closing the last door:
Q1 stayed 0 before ten seconds, became 1 after 10 seconds.
Opening I2 immediately dropped Q1 to 0. Reclosing I2
showed Q1=0 at ~2 seconds and Q1=1 after ~12 seconds total.
Native Owen Logic displayed `T = 10000 ms` at completion.

**These are manual GUI observations**; structure and offline tests
cannot independently certify simulator accuracy or physical timing.

## Next complete-app gates

1. Create native, **per-door separate** normal lock grant commands:
   request from S2000-2 K1 on CNC→1257 / local button on others,
   plus PLC timed permit.
2. Introduce **mutual exclusive request reservation** before
   any reed opens: two simultaneous requests can otherwise
   unlock two doors while the shared room timer still reads READY.
   Evaluate native RS/set-reset, request edge detection,
   expiration and open-door feedback in Owen Logic.
3. Support seven shared-door reeds with six 10-second room zones,
   physical door priority, timeout if no opening,
   door-open alarm and optional dirty-side early exit.
4. Confirm actual PR102+PRM/PR103 catalogue electrical I/O and
   real isolated K1/K2+PLC lock control contact polarity.
5. Deliver separate native Owen Logic COMPILE/SAVE/SIMULATE
   evidence for all essential scenarios on the final chosen
   controller model, including hardware emergency exit tests.
6. **No hardware download or Modbus DO write until operator approval**
   and independent tested fire/egress release.

**Technical warning**: this native FBD is a timer input
proof, not a complete or safe interlocking system.
