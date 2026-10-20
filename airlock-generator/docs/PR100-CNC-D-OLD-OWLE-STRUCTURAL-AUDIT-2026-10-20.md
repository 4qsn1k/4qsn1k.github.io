# PR100 CNC–D — read-only structural audit of attached old OWLE

Date: 2026-10-20. **Old source only**, not generated multiroom Airlock code.
The user supplied `Шлюз CNC-D.owle` in the conversation. The file is
a valid OWLE ZIP with one `Project` JSON member, 43 native FBD elements,
36 native connectors and no `StFunctionBlocks` member. Saved with
Owen Logic `2.11.368.0`; its `DocumentModel.DevValue` is `PR100FA4`.

The open `ProgramRelayFBD.exe` window on Z4559 (PID 34944 at inspection)
references a local Desktop OWLE with the same file content hash.
Both the uploaded file and the local open-file path matched SHA256
`f9157f3afc0073795bb192d98cb2ccfda721f81baa400b133824e77645096644`.
That verifies the **opened source file**, not the executable program
currently flashed in the PR100 controller.

## Native FBD input/output labels and links

| Physical item | Label in OWLE (native comment) | Structural source/consumer |
| --- | --- | --- |
| I1 | `Дверь А открыта` | Inverter NOT; TON_OPEN_A; cycle A logic |
| I2 | `Дверь Б открыта` | Inverter NOT; TON open B; cycle B logic |
| I3 | `ПОЖАР` | Both Q2/Q4 and Q3 enable AND; NOT for fire/latch path |
| Q1 | `Замок Б` | Exact inversion of the common Q2/Q4 logic signal |
| Q2 | `Светофор` | Same final AND output as Q4 |
| Q3 | `Зуммер` | Separate final AND from timed open-door logic |
| Q4 | `BUSY` | Same final AND output as Q2 |

**Confirmed mismatch with earlier oral description:** the operator
described Q3=BUSY and Q4=buzzer, whereas this saved source shows
Q3=buzzer and Q4=BUSY. This report does not silently rename pins;
verify the actual wiring and the loaded program before using either.

Structural Boolean expression derived solely from native connector
endpoints (NOT a verified statement about active PLC firmware):

- `Q2 = Q4 = I3 AND (RS_CYC_A OR RS_CYC_B)`.
- `Q1 = NOT Q2`.
- `Q3 = I3 AND (TON_OPEN_A OR TON_OPEN_B OR ((NOT I1) AND (NOT I2)))`.
- TON_OPEN_A and second unlabelled open-door TON each take `NOT I1`
  and `NOT I2`, respectively; both feed the Q3 buzzer chain.
- Two additional TONs are labelled TON_AIR_A and TON_AIR_B; they
  participate in room cycle/latch logic, not the direct buzzer chain.
- There are two RS latches (`RS_CYC_A`, `RS_CYC_B`) and four TON timers.
- All four TON wrappers store `ImpulseTime = 3` and `TimeScale = 0`.
  The time-unit mapping of this older OWLE serializer is **not**
  independently established. Do not equate the raw `3` to 3s or 30s.

From the equations above, the buzzer branch also includes a direct
two-doors-open clause (`NOT I1 AND NOT I2`), in addition to the
individual timeout outputs. This may produce an immediate buzzer
for simultaneous opening even when no timeout has elapsed.

## Reconcile with physical measurements

Five-stage Z4559 RTU test observed:

| Reed state | DI1/DI2/DI3 | Observed Q1/Q2/Q3/Q4 |
| --- | --- | --- |
| Both magnets present | 111 | 1000 |
| Only I1 contact open | 011 | 0111 |
| Restored | 111 | 1000 |
| Only I2 contact open | 101 | 0111 |
| Both restored | 111 | 1000 |

These observed Q outputs are consistent with the source's inverted
Q1 and shared Q2/Q4. Q3=1 after opening does **not** establish buzzer
delay, because readout occurred after an unspecified time from the
physical magnet movement. Actual loaded program identity, timer unit
and audible output must be checked separately with a controlled
near-immediate / delayed-read experiment. Do not drive Q outputs.

## Safety and applicability

The user describes an Aler 400 type with separate lock control
terminal and an alternative two-wire fail-safe supply interruption.
The electrical polarity of physical lock release depends on wiring.
Observed logical Q1 cannot establish actual release or emergency
egress behavior. The old project uses DI3 as an APS-normal jumper,
not a validated fire-alarm circuit. Q2 drives a DPDT traffic-light
relay in the user's old wiring; Q2 ON selects red there. Q4, labelled
BUSY by source, can be mapped to S2000-2 BUSY only after checking
field terminal connections. Physical outputs were not used in this
read-only audit.

No Owen editor Save, firmware upload, Modbus writes, program change,
actuator test, hardware rewiring or COM5 access was performed while
inspecting the archived project.

**Acceptance boundary:** old native FBD parsed and native pin/edge
roles structurally identified. Actual deployed firmware, timer
duration, fire fail-safe, lock behavior and the new native Airlock
Generator multiroom program are **NOT VERIFIED**.
