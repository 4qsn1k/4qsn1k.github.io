# PR100 — результат аппаратной проверки герконов 20.10.2026

Status: **PASS_5_STAGES** (read-only Modbus input/output observations).
Host: Z4559; test PR100; COM5 CP210x; 9600 8N1; Modbus unit 16.
The controller still contains the **old CNC–D airlock project**.
No new Airlock Generator program was loaded.

## Preconditions and procedure

The operator connected dry-contact reeds to DI1 (CNC) and DI2 (D),
and a test APS jumper to DI3. Two magnets were manually moved
sequentially, restoring the first before actuating the second.
DI3 was not manipulated. The agent/script only performed Modbus
**FC02 address 4096 count 8** and **FC01 address 0 count 8**.
No write function was called and no physical lock/relay/actuator
was commanded by this program. The old PLC application was active,
so its own Q outputs changed in response to the input states.

Tool: `gateway/pr100-manual-input-qa.py`.
Each phase obtained three consecutive DI/Q samples; each phase
passed the strict expected DI1–DI3 bits and stable DI criterion.
The standalone diagnostic opened and closed the serial port per phase.

## Verified physical I/O

All samples below are the actual, read-back `DI1..DI8` and `Q1..Q8`
vectors from the local session JSON. Times are UTC.

| Phase | Sample time (UTC) | DI1–DI8 | Q1–Q8 | Outcome |
| --- | --- | --- | --- | --- |
| baseline | 05:03:08 | 11100000 | 10000000 | PASS |
| di1_open | 05:07:22 | 01100000 | 01110000 | PASS |
| di1_restored | 05:26:14 | 11100000 | 10000000 | PASS |
| di2_open | 05:27:09 | 10100000 | 01110000 | PASS |
| di2_restored | 05:28:14 | 11100000 | 10000000 | PASS |

For both independently operated dry contacts:
- Only the corresponding DI bit changed on opening.
- DI3 stayed 1; DI4–DI8 stayed 0.
- Closing restored the original input vector.
- Q1 changed 1→0 on opening and 0→1 on closure.
- Q2, Q3 and Q4 changed 0→1 on opening and 1→0 on closure.
- The observations do **not** prove Q output polarity, field relay
  position, lock released/held, traffic-light hardware, or 2000-2
  reader blocking, because none was validated with actual actuators.

## User-supplied OLD project output semantics

These assignments describe the old CNC–D test circuit only. They are
not universal and may differ by lock type and electrical wiring.

- Q1 — old lock control. For an Aler AL-400 type with continuously
  powered lock and separate control terminals, the internal relay
  interrupts the magnetic coil on control activation. A two-wire
  fail-safe lock instead releases when its supply is interrupted.
  **Do not infer lock state from Q1 without confirming wiring and
  fail-safe release in the field.**
- Q2 — DPDT relay controlling the red/green door lamp; in the
  operator's old circuit, Q2 ON selects RED.
- Earlier **operator description** assigned Q3=BUSY and Q4=buzzer.
  **A later inspection of the uploaded old OWLE found the opposite**:
  Q3 native comment is "Зуммер", Q4 native comment is "BUSY".
  The preserved original operator account must not be mistaken for
  a verified wiring map. The saved diagram routes identical signals
  to Q2 and Q4, and a separate two-TON open-door path to Q3.
  These are **source-file** facts, not proof that the flashed PR100
  program and its physical terminal connections are identical.
- The observed Q3=1 after both open-door actions does **not**
  establish the 30-second timeout: physical movement preceded readout
  by an unmeasured interval. Native TON fields encode
  ImpulseTime=3, TimeScale=0; the exact time unit is still unverified.
  See docs/PR100-CNC-D-OLD-OWLE-STRUCTURAL-AUDIT-2026-10-20.md.
- DI3 jumper 1 means APS normal under the old circuit's
  normally-closed break-to-alarm convention. It **does not**
  validate a real fire system, reliable APS fault handling,
  hardware emergency release, or compliance.

## Evidence, cleanup and limitations

Original local-only session file on Z4559:
`AirlockGeneratorLab/bench-20261019/pr100-physical-inputs-20261020.json`.
SHA256:
`b337bfc2dd5769a3fc9412fa7cb233d4a1a095f4dc62634f7f8d65e95a7c9716`.

After completion, TCP port 8787 listeners = 0, Airlock
reader/worker processes = 0, COM5 was released.
Session status = `PASS_5_STAGES` and history includes all five
manual phases. No physical outputs or access systems were connected
by the diagnostic.

**Scope PASS:** standalone RS-485 Modbus polling, repeatable two
dry-contact transitions and restoration of reported PLC Q states.

**Still NOT PASSED:** 30-second buzzer timing (Q3 per archived OWLE; physical output assignment unverified); actual S2000-2
BUSY behavior; lamp wiring; either lock release type; hardware
APS/fire-fail-safe release; pressure or ventilation; all multiroom
wiring; full native generated .owle save/compile/simulation; loading
a new program into PR100; commissioning/egress approval.

This report is a completed field-input QA, **not a deployment or
acceptance of the new multiroom Airlock Generator project**.
