# Airlock Generator — COM5 / PR100 physical read-only port-control QA

Date: 2026-10-19. Test host: Z4559. Test controller: PR100. This
is a physical communications/ownership QA only, **not** interlock or
electrical safety commissioning.

## Authorization and scope

The operator explicitly reconnected the RS-485 adapter to PR100 and
authorized continuation. COM5 was released by the earlier diagnostic
task. Tests used a dedicated, local, one-shot SCADA instance and the
**read-only** bench profile (`modbus-rtu`, CP210x COM5, 9600 8N1, unit
16, FC01 coils + FC02 discrete inputs). No FC05/06/15/16, no firmware
upload, no project transfer, no fire/egress actions and no changes to
locks or actuators.

Before startup: Windows enumerated COM5, no TCP listener on
`127.0.0.1:8787`, and no competing Airlock process was found. The
test launched the gateway with an explicit local Python virtual
environment (`pymodbus` available); it did **not** set autostart or
install a persistent service.

## Independent direct probe

`ModbusSerialClient`, `read_discrete_inputs(4096, 8, device_id=16)`,
`timeout=1.2s`, `retries=0`:

- Serial open: **PASS**.
- FC02 response class: `ReadDiscreteInputsResponse`, `isError=false`.
- Elapsed end-to-end approximately **96 ms**.
- DI1..DI8: `0 0 0 0 0 0 0 0`.
- Serial connection closed: **PASS**.

The former `ModbusIOException` did not recur after reconnection.
The disconnect of the cable is a *plausible* explanation, not a
proven root cause.

## One-shot SCADA release/resume verification

Outcome: **PASS**, `closed=true`, exit code **0**.

| Ordered phase | Confirmed observation |
| --- | --- |
| INITIAL_READ | source=live; validControllers=1; PR1 online; DI/Q read without protocol error |
| RELEASE | API returned released=true, port paused=true; source=offline; validControllers=0; offlineCause=PORT_RELEASED; raw readings cleared; all 8 demo doors UNKNOWN |
| RESUME_IMMEDIATE | port paused=false, source=offline; validControllers=0; offlineCause=NOT_POLLED; old samples were **not** restored as valid |
| FRESH_READ_AFTER_RESUME | source=live; PR1 online; validControllers=1; lastSuccessAt increased relative to initial read |
| FINAL_RELEASE | released=true; source=offline; validControllers=0; offlineCause=PORT_RELEASED |
| CLOSE | gateway closed without exception |

Observed `lastSuccessAt` values (Unix epoch ms): initial
`1792416048355`, after resume `1792416048887`.
The new sample was **532 ms later**. DI1..DI8 remained `0`;
Q1 read as `1`; Q2..Q8 read as `0`.
**These are observed current input/output states, not commands sent to
the controller.** Previous historical DI/Q snapshots may differ.

All eight demo doors stayed `UNKNOWN` while online too. That is
**expected**: this bench profile reads unassigned PLC_PR1.DI/Q signals;
it does not map real reeds into the eight demo doors. Never infer real
door status, opening permission, lock state or GREEN from these bits.

## Cleanup and independent evidence

The one-shot process shut down. A post-run check found:
`localhost:8787` listeners: **0**; Airlock RTU process count: **0**.
A separate PySerial open/close of COM5 then succeeded, proving the
port was actually released at that moment.

Z4559 local evidence file (not published):
`AirlockGeneratorLab/bench-20261019/qa-com5-live-port-control-connected-20261019.json`.
SHA256:
`ad7de9744ccb04d1548dc8345629664a83450d684ec1eee2da55c904ebacc591`.

No tokens, raw bench profile, equipment identifiers beyond generic
PR100/COM5 or user credentials are committed. The test ran **against
the previously deployed Z4559 local SCADA source**. This is an
observed runtime QA, not a source change.

## Remaining acceptance gates

- Native `.owle` generation/compilation for the multiroom graph:
  **NOT PASSED** (Issue #14).
- Door-specific real DI mapping, polarity, reliable reed health:
  **NOT TESTED**.
- Real SCADA front-end button interaction with external UPROG:
  **NOT TESTED**; release/resume was verified through the local
  protected HTTP API.
- Real lock power, door indicators, ventilation, fire egress and
  physical safety/commissioning: **NOT PASSED**.
- Full PR100 field I/O proof (manual input actuation and matched
  front-panel LED): **NOT PART OF THIS RUN**.
