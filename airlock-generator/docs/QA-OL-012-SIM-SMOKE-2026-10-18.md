# QA-OL-012 — native FBD simulator smoke, HOME-PC 18.10.2026

**Status: PARTIAL OBSERVATION, not QA-OL-012 PASS.**

Environment: Owen Logic 3.3.378.0, interactive console, PID 9988, standalone `Airlock_FBD_QA012_HOME.owle`. `Shift+F5` entered simulator mode, and the native simulator's separate **Пуск (F6)** control was activated. No physical PR connected.

## Direct GUI observations

1. Initial virtual `I1/FireNormal=0` (other virtual inputs were zero): native FBD showed `FB_Room_N1.O_State=99`, `FB_Room_N4.O_State=99`, both `O_Fire=1`, test `Q4=0`. This is the state shown with the fire-normal signal absent. This was a static smoke observation, not the final QA-OL-012F sequence.
2. After clicking the **I1 input block** inside the running native FBD simulator, the input value changed from `0` to **`1`**. With door reeds still at `0` (open), the captured native FBD showed:
   - `FB_Room_N1.FireNormal=1`
   - `FB_Room_N1.O_State=90`
   - `FB_Room_N1.O_Fault=1`
   - `FB_Room_N1.O_D_1_4_Block=1`
   - `OR.Input0=1`, `OR.Input1=1`, `OR.Output=1`
   - test `Q4=1`
   - the screenshot of this state was captured locally at `C:\Users\Forest\Documents\AirlockGeneratorBackup\owen-tests\QA012-input-crop.jpg`.

This is a **real interactive native simulator response**; it is not from JavaScript reference tests. Only the displayed values above were confirmed. N4.State, exact reaction time, closed/reopen cycles and dwell timer have not yet been logged.

## Pending required native QA

- Set unique door inputs I3, I4, I5, I6, I7, I8 to closed (1), keeping shared door I4 as a single virtual input.
- Recover the two FB fault latches with I2/ResetFault as per program behavior, then return ResetFault to 0.
- Confirm both zones READY and `Q1=1`, `Q2=1`, `Q4=0`.
- Test individual scenarios A–F (N1 purge 30 s, N4 busy, shared door open/close, timer restart, OR inhibit and fire), recording values and timestamps.
- Capture explicit compiler diagnostics. Running simulator alone is not proof of complete QA acceptance.

The verifier `bridge/qa012_verify_native_fbd.ps1` separately returned 16/16 PASS, exit 0, for the saved OWLE; see [validator log](QA-OL-012-VALIDATOR-2026-10-18.md).

No physical controller, door lock, alarm, or operating access-control system was touched.
